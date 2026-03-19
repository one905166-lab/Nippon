#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)

function getArg(name, fallback = '') {
  const prefix = `--${name}=`
  const value = args.find((arg) => arg.startsWith(prefix))
  if (!value) return fallback
  return value.slice(prefix.length).trim() || fallback
}

const showHelp = args.includes('--help') || args.includes('-h')
const isDryRun = args.includes('--dry-run')

const inputFile = getArg('file', '')
const outputFile = getArg('out', 'imports/anime-import.enriched.json')
const delayMsRaw = Number(getArg('delay-ms', '250'))
const delayMs = Number.isFinite(delayMsRaw) ? Math.max(0, Math.trunc(delayMsRaw)) : 250

function printHelp() {
  console.log('Anime metadata enricher (Jikan API)')
  console.log('')
  console.log('Usage:')
  console.log(
    '  node scripts/enrich-anime-metadata.js --file=<input.json> [--out=<output.json>] [--dry-run] [--delay-ms=250]'
  )
  console.log('')
  console.log('Input:')
  console.log('  - Array of anime objects, or { "animes": [...] }')
  console.log('  - Minimal entry can be: { "title": "Anime Name", "episodes": [...] }')
  console.log('')
  console.log('Output:')
  console.log('  - Same shape as input, with missing metadata filled from Jikan')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

function normalizeSearchText(value) {
  return normalizeText(value, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseImportPayload(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.animes)) return payload.animes
  return []
}

function getAnimeQueryTitle(anime) {
  return normalizeText(
    anime?.titre_en ||
      anime?.title_en ||
      anime?.title ||
      anime?.name ||
      anime?.titre_jp ||
      anime?.titre_ar ||
      '',
    ''
  )
}

function parseDurationMinutes(durationLabel) {
  const match = String(durationLabel || '').match(/(\d+)\s*min/i)
  if (!match) return null
  const minutes = Number(match[1])
  return Number.isFinite(minutes) && minutes > 0 ? Math.trunc(minutes) : null
}

function scoreCandidate(query, inputYear, candidate) {
  const queryNorm = normalizeSearchText(query)
  if (!queryNorm) return 0

  const candidateTitles = [candidate?.title_english, candidate?.title, candidate?.title_japanese]
    .map((title) => normalizeSearchText(title))
    .filter(Boolean)

  if (!candidateTitles.length) return 0

  let best = 0

  for (const title of candidateTitles) {
    let score = 0

    if (title === queryNorm) score += 120
    else if (title.includes(queryNorm)) score += 92
    else if (queryNorm.includes(title)) score += 80

    const queryTokens = queryNorm.split(' ').filter(Boolean)
    const titleTokens = new Set(title.split(' ').filter(Boolean))
    if (queryTokens.length > 0) {
      const overlap = queryTokens.filter((token) => titleTokens.has(token)).length
      score += Math.round((overlap / queryTokens.length) * 45)
    }

    if (score > best) best = score
  }

  const candidateYear = Number(candidate?.year)
  if (Number.isFinite(inputYear) && Number.isFinite(candidateYear)) {
    if (candidateYear === inputYear) best += 15
    else if (Math.abs(candidateYear - inputYear) === 1) best += 6
  }

  return best
}

function pickBestCandidate(queryTitle, inputYear, items) {
  if (!Array.isArray(items) || items.length === 0) return null

  let bestItem = null
  let bestScore = -1

  for (const item of items) {
    const score = scoreCandidate(queryTitle, inputYear, item)
    if (score > bestScore) {
      bestScore = score
      bestItem = item
    }
  }

  return bestScore >= 35 ? bestItem : null
}

async function fetchJikanByTitle(title) {
  const query = new URLSearchParams({
    q: title,
    limit: '10',
    sfw: 'true'
  })

  const url = `https://api.jikan.moe/v4/anime?${query.toString()}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Jikan request failed (${response.status})`)
  }

  const payload = await response.json()
  return Array.isArray(payload?.data) ? payload.data : []
}

function mapJikanToMetadata(item) {
  const englishTitle = normalizeText(
    item?.title_english || item?.title || item?.title_japanese || '',
    ''
  )
  const japaneseTitle = normalizeText(item?.title_japanese || '', '')
  const synopsis = normalizeText(item?.synopsis || '', '')

  return {
    id: Number.isFinite(Number(item?.mal_id)) ? Math.trunc(Number(item.mal_id)) : null,
    titre_en: englishTitle || null,
    titre_jp: japaneseTitle || null,
    titre_ar: englishTitle || null,
    synopsis_en: synopsis || null,
    poster_url: item?.images?.jpg?.large_image_url || item?.images?.jpg?.image_url || null,
    banner_url: item?.trailer?.images?.maximum_image_url || null,
    format: item?.type || null,
    statut: item?.status || null,
    studio: item?.studios?.[0]?.name || null,
    season: item?.season || null,
    year: Number.isFinite(Number(item?.year)) ? Math.trunc(Number(item.year)) : null,
    jour_sortie: item?.broadcast?.day || null,
    note_imdb: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
    age_rating: item?.rating || null,
    total_episodes: Number.isFinite(Number(item?.episodes))
      ? Math.trunc(Number(item.episodes))
      : null,
    duree_episode: parseDurationMinutes(item?.duration),
    genres: Array.isArray(item?.genres)
      ? item.genres.map((genre) => normalizeText(genre?.name || '', '')).filter(Boolean)
      : []
  }
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function fillMissing(target, key, value) {
  if (hasValue(target[key])) return
  if (!hasValue(value)) return
  target[key] = value
}

function enrichFromMetadata(anime, metadata, fallbackTitle) {
  const enriched = { ...anime }

  fillMissing(enriched, 'id', metadata.id)
  fillMissing(enriched, 'titre_en', metadata.titre_en)
  fillMissing(enriched, 'titre_jp', metadata.titre_jp)
  fillMissing(enriched, 'titre_ar', metadata.titre_ar || fallbackTitle)
  fillMissing(enriched, 'synopsis_en', metadata.synopsis_en)
  fillMissing(enriched, 'poster_url', metadata.poster_url)
  fillMissing(enriched, 'banner_url', metadata.banner_url)
  fillMissing(enriched, 'format', metadata.format)
  fillMissing(enriched, 'statut', metadata.statut)
  fillMissing(enriched, 'studio', metadata.studio)
  fillMissing(enriched, 'season', metadata.season)
  fillMissing(enriched, 'year', metadata.year)
  fillMissing(enriched, 'jour_sortie', metadata.jour_sortie)
  fillMissing(enriched, 'note_imdb', metadata.note_imdb)
  fillMissing(enriched, 'age_rating', metadata.age_rating)
  fillMissing(enriched, 'total_episodes', metadata.total_episodes)
  fillMissing(enriched, 'duree_episode', metadata.duree_episode)

  if (!hasValue(enriched.genres) && hasValue(metadata.genres)) {
    enriched.genres = metadata.genres
  }

  if (!hasValue(enriched.titre_ar)) {
    enriched.titre_ar = fallbackTitle || metadata.titre_en || 'Untitled'
  }

  if (!Array.isArray(enriched.episodes)) {
    enriched.episodes = []
  }

  return enriched
}

async function enrichAnime(anime) {
  const queryTitle = getAnimeQueryTitle(anime)
  const fallbackTitle = queryTitle || normalizeText(anime?.titre_ar || '', '')
  const inputYear = Number(anime?.year)

  if (!queryTitle) {
    return {
      enriched: anime,
      matched: false,
      reason: 'No title provided'
    }
  }

  try {
    const candidates = await fetchJikanByTitle(queryTitle)
    const best = pickBestCandidate(
      queryTitle,
      Number.isFinite(inputYear) ? inputYear : null,
      candidates
    )

    if (!best) {
      return {
        enriched: anime,
        matched: false,
        reason: 'No API match'
      }
    }

    const metadata = mapJikanToMetadata(best)
    return {
      enriched: enrichFromMetadata(anime, metadata, fallbackTitle),
      matched: true,
      reason: null,
      apiTitle: metadata.titre_en || best?.title || queryTitle
    }
  } catch (error) {
    return {
      enriched: anime,
      matched: false,
      reason: error instanceof Error ? error.message : 'Unknown API error'
    }
  }
}

async function main() {
  if (showHelp) {
    printHelp()
    process.exit(0)
  }

  if (!inputFile) {
    console.error('Missing required --file argument')
    printHelp()
    process.exit(1)
  }

  const absoluteInput = path.resolve(process.cwd(), inputFile)
  const absoluteOutput = path.resolve(process.cwd(), outputFile)

  if (!fs.existsSync(absoluteInput)) {
    console.error(`Input file not found: ${absoluteInput}`)
    process.exit(1)
  }

  let payload
  try {
    payload = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'))
  } catch {
    console.error('Invalid JSON input')
    process.exit(1)
  }

  const animeEntries = parseImportPayload(payload)
  if (!animeEntries.length) {
    console.error('No animes found in input payload (expected array or { animes: [] })')
    process.exit(1)
  }

  const enrichedAnimes = []
  const unmatched = []
  let matchedCount = 0

  for (let index = 0; index < animeEntries.length; index += 1) {
    const anime = animeEntries[index]
    const title = getAnimeQueryTitle(anime) || `#${index + 1}`
    const result = await enrichAnime(anime)
    enrichedAnimes.push(result.enriched)

    if (result.matched) {
      matchedCount += 1
      console.log(`[${index + 1}/${animeEntries.length}] matched: ${title}`)
    } else {
      unmatched.push({ title, reason: result.reason || 'No match' })
      console.log(`[${index + 1}/${animeEntries.length}] unmatched: ${title}`)
    }

    if (delayMs > 0 && index < animeEntries.length - 1) {
      await sleep(delayMs)
    }
  }

  const outputPayload = Array.isArray(payload)
    ? enrichedAnimes
    : {
        ...payload,
        animes: enrichedAnimes
      }

  if (!isDryRun) {
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true })
    fs.writeFileSync(absoluteOutput, `${JSON.stringify(outputPayload, null, 2)}\n`, 'utf8')
    console.log(`\nSaved enriched file: ${absoluteOutput}`)
  }

  console.log(`\nEnrichment summary: matched ${matchedCount}/${animeEntries.length}`)
  if (unmatched.length > 0) {
    console.log('Unmatched entries:')
    unmatched.slice(0, 20).forEach((item) => {
      console.log(`- ${item.title} (${item.reason})`)
    })
  }

  if (isDryRun) {
    console.log('Dry run complete (no file written).')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

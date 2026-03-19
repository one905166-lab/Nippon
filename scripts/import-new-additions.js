#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function getArg(name, fallback = '') {
  const prefix = `--${name}=`
  const value = args.find((arg) => arg.startsWith(prefix))
  if (!value) return fallback
  return value.slice(prefix.length).trim() || fallback
}

const showHelp = args.includes('--help') || args.includes('-h')
const keepInput = args.includes('--keep-input')
const allowNonDirect = args.includes('--allow-non-direct')

const inputFile = path.resolve(process.cwd(), getArg('file', 'imports/anime-import.sample.json'))
const enrichedFile = path.resolve(
  process.cwd(),
  getArg('out', 'imports/anime-import.enriched.json')
)
const normalizedFile = path.resolve(
  process.cwd(),
  getArg('normalized', 'imports/.anime-import.normalized.json')
)

function printHelp() {
  console.log('Import new additions (enrich -> import -> clear input)')
  console.log('')
  console.log('Usage:')
  console.log(
    '  node scripts/import-new-additions.js [--file=imports/anime-import.sample.json] [--out=imports/anime-import.enriched.json] [--keep-input] [--allow-non-direct]'
  )
  console.log('')
  console.log('Behavior:')
  console.log('  1) Reads your input JSON')
  console.log('  2) Converts shorthand syntax -> standard episodes/servers format')
  console.log('  3) Validates URLs (direct media links only by default)')
  console.log('  4) Enriches metadata via API')
  console.log('  5) Imports into DB (without reset)')
  console.log('  6) Clears input JSON to { "animes": [] } (unless --keep-input)')
  console.log('')
  console.log('Shorthand syntax accepted:')
  console.log('  - anime.add: ["1|1080p|https://...m3u8", "2|https://...m3u8"]')
  console.log('  - anime.eps: { "1": "https://...m3u8", "2": { "1080p": "...", "720p": "..." } }')
}

function parsePayload(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.animes)) return payload.animes
  return []
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

function asPositiveInt(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const rounded = Math.trunc(number)
  return rounded > 0 ? rounded : null
}

function isDirectMediaUrl(url) {
  const value = normalizeText(url, '')
  if (!value) return false
  return /\.(m3u8|mp4|mkv|webm)(\?|$)/i.test(value)
}

function normalizeServerEntry(server, fallbackQuality = 'auto') {
  if (typeof server === 'string') {
    return {
      quality: fallbackQuality,
      language: 'ar',
      url: normalizeText(server, '')
    }
  }

  if (!server || typeof server !== 'object') return null

  return {
    name: normalizeText(server?.name || server?.nom_serveur || '', ''),
    quality: normalizeText(server?.quality || server?.qualite || server?.resolution || fallbackQuality, fallbackQuality),
    language: normalizeText(server?.language || server?.langue || 'ar', 'ar'),
    url: normalizeText(server?.url || server?.url_video || server?.stream_url || '', '')
  }
}

function parseEpisodeShorthand(value, fallbackIndex = 0) {
  const raw = normalizeText(value, '')
  if (!raw) return null

  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null

  const episodeNumber = asPositiveInt(parts[0]) || fallbackIndex + 1
  let quality = 'auto'
  let url = ''

  if (parts.length === 2) {
    url = parts[1]
  } else {
    quality = parts[1]
    url = parts.slice(2).join('|').trim()
  }

  return {
    number: episodeNumber,
    servers: [
      {
        quality: normalizeText(quality, 'auto'),
        language: 'ar',
        url: normalizeText(url, '')
      }
    ]
  }
}

function mergeEpisode(episodeMap, episode) {
  if (!episode) return

  const number = asPositiveInt(episode?.number || episode?.numero || episode?.episode)
  if (!number) return

  const existing = episodeMap.get(number) || {
    number,
    title: '',
    description: '',
    release_date: '',
    servers: []
  }

  existing.title = existing.title || normalizeText(episode?.title || episode?.titre_ar || episode?.name || '', '')
  existing.description = existing.description || normalizeText(episode?.description || episode?.synopsis || '', '')
  existing.release_date = existing.release_date || normalizeText(episode?.release_date || episode?.date_sortie || '', '')

  let servers = []

  if (Array.isArray(episode?.servers)) {
    servers = episode.servers
      .map((server) => normalizeServerEntry(server))
      .filter((server) => server && server.url)
  } else if (Array.isArray(episode?.serveurs)) {
    servers = episode.serveurs
      .map((server) => normalizeServerEntry(server))
      .filter((server) => server && server.url)
  } else if (episode?.links && typeof episode.links === 'object') {
    servers = Object.entries(episode.links)
      .map(([quality, url]) => normalizeServerEntry({ quality, url }, quality))
      .filter((server) => server && server.url)
  } else if (episode?.url || episode?.url_video) {
    servers = [
      normalizeServerEntry(
        {
          quality: episode?.quality || episode?.qualite || 'auto',
          language: episode?.language || episode?.langue || 'ar',
          url: episode?.url || episode?.url_video
        },
        'auto'
      )
    ].filter((server) => server && server.url)
  }

  for (const server of servers) {
    const alreadyExists = existing.servers.some(
      (item) => normalizeText(item?.url, '') === normalizeText(server?.url, '')
    )
    if (!alreadyExists) {
      existing.servers.push(server)
    }
  }

  episodeMap.set(number, existing)
}

function normalizeEpisodesFromMap(mapValue) {
  if (!mapValue || typeof mapValue !== 'object' || Array.isArray(mapValue)) return []

  const list = []
  for (const [episodeKey, value] of Object.entries(mapValue)) {
    const number = asPositiveInt(episodeKey)
    if (!number) continue

    if (typeof value === 'string') {
      list.push({
        number,
        servers: [{ quality: 'auto', language: 'ar', url: normalizeText(value, '') }]
      })
      continue
    }

    if (!value || typeof value !== 'object') continue

    if (value.url || value.url_video || value.links || Array.isArray(value.servers)) {
      list.push({ number, ...value })
      continue
    }

    const links = {}
    for (const [quality, url] of Object.entries(value)) {
      if (typeof url !== 'string') continue
      links[quality] = url
    }

    list.push({ number, links })
  }

  return list
}

function normalizeAnimeEntry(anime) {
  const episodeMap = new Map()

  const fullEpisodes = Array.isArray(anime?.episodes) ? anime.episodes : []
  fullEpisodes.forEach((entry, index) => {
    if (typeof entry === 'string') {
      mergeEpisode(episodeMap, parseEpisodeShorthand(entry, index))
      return
    }

    mergeEpisode(episodeMap, entry)
  })

  const shorthandAdd = Array.isArray(anime?.add) ? anime.add : []
  shorthandAdd.forEach((entry, index) => {
    if (typeof entry === 'string') {
      mergeEpisode(episodeMap, parseEpisodeShorthand(entry, index))
    }
  })

  const epsMap = normalizeEpisodesFromMap(anime?.eps)
  epsMap.forEach((entry) => mergeEpisode(episodeMap, entry))

  const normalizedEpisodes = [...episodeMap.values()]
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((episode) => ({
      number: episode.number,
      ...(episode.title ? { title: episode.title } : {}),
      ...(episode.description ? { description: episode.description } : {}),
      ...(episode.release_date ? { release_date: episode.release_date } : {}),
      servers: episode.servers
    }))

  return {
    ...anime,
    episodes: normalizedEpisodes
  }
}

function validateDirectUrls(animes) {
  const errors = []

  for (const anime of animes) {
    const animeTitle = normalizeText(anime?.title || anime?.titre_en || anime?.titre_ar || 'Untitled', 'Untitled')
    const episodes = Array.isArray(anime?.episodes) ? anime.episodes : []

    for (const episode of episodes) {
      const number = asPositiveInt(episode?.number || episode?.numero || episode?.episode) || '?'
      const servers = Array.isArray(episode?.servers)
        ? episode.servers
        : Array.isArray(episode?.serveurs)
          ? episode.serveurs
          : []

      if (!servers.length) {
        errors.push({ animeTitle, episode: number, reason: 'No server link provided' })
        continue
      }

      for (const server of servers) {
        const url = normalizeText(server?.url || server?.url_video || '', '')
        if (!url) {
          errors.push({ animeTitle, episode: number, reason: 'Empty server URL' })
          continue
        }

        if (!allowNonDirect && !isDirectMediaUrl(url)) {
          errors.push({
            animeTitle,
            episode: number,
            reason: `Unsupported URL (must be direct media .m3u8/.mp4/.mkv/.webm): ${url}`
          })
        }
      }
    }
  }

  return errors
}

function runNodeScript(scriptPath, scriptArgs) {
  const result = spawnSync('node', [scriptPath, ...scriptArgs], {
    cwd: process.cwd(),
    stdio: 'inherit'
  })

  return Number.isFinite(result.status) ? result.status : 1
}

function main() {
  if (showHelp) {
    printHelp()
    process.exit(0)
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`)
    process.exit(1)
  }

  let payload
  try {
    payload = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
  } catch {
    console.error('Input JSON is invalid')
    process.exit(1)
  }

  const animes = parsePayload(payload)
  if (!animes.length) {
    console.log('No new additions found in input file. Nothing to import.')
    process.exit(0)
  }

  const normalizedAnimes = animes.map((anime) => normalizeAnimeEntry(anime))
  const normalizedPayload = Array.isArray(payload)
    ? normalizedAnimes
    : {
        ...payload,
        animes: normalizedAnimes
      }

  const validationErrors = validateDirectUrls(normalizedAnimes)
  if (validationErrors.length > 0) {
    console.error('Import blocked: invalid/unsupported episode links found.')
    validationErrors.slice(0, 20).forEach((item) => {
      console.error(`- ${item.animeTitle} / episode ${item.episode}: ${item.reason}`)
    })
    console.error('Use direct media links only (.m3u8/.mp4/.mkv/.webm).')
    console.error('If you really want to bypass this check, rerun with --allow-non-direct')
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(normalizedFile), { recursive: true })
  fs.writeFileSync(normalizedFile, `${JSON.stringify(normalizedPayload, null, 2)}\n`, 'utf8')

  const enrichExit = runNodeScript('scripts/enrich-anime-metadata.js', [
    `--file=${normalizedFile}`,
    `--out=${enrichedFile}`
  ])

  if (enrichExit !== 0) {
    if (fs.existsSync(normalizedFile)) fs.unlinkSync(normalizedFile)
    process.exit(enrichExit)
  }

  const importExit = runNodeScript('scripts/import-anime-data.js', [`--file=${enrichedFile}`])

  if (importExit !== 0) {
    if (fs.existsSync(normalizedFile)) fs.unlinkSync(normalizedFile)
    process.exit(importExit)
  }

  if (fs.existsSync(normalizedFile)) fs.unlinkSync(normalizedFile)

  if (!keepInput) {
    fs.writeFileSync(inputFile, `${JSON.stringify({ animes: [] }, null, 2)}\n`, 'utf8')
    console.log(`Cleared input file: ${inputFile}`)
  }

  console.log('Done: new additions imported.')
}

main()

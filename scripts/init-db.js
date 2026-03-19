#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '../src/renderer/database')
const schemaPath = path.join(dbDir, 'schema.sql')
const dbPath = path.join(dbDir, 'anime.db')
const TOP_ANIME_URL = 'https://api.jikan.moe/v4/top/anime'
const DEFAULT_SEED_PAGES = 3
const DEFAULT_PAGE_LIMIT = 25

const args = process.argv.slice(2)
const shouldSeed = args.includes('--seed')
const shouldResetAnimeData = args.includes('--reset')
const shouldWipeAllData = args.includes('--wipe-all')
const pageArg = args.find((arg) => arg.startsWith('--pages='))
const limitArg = args.find((arg) => arg.startsWith('--limit='))

const requestedPages = Number(pageArg?.split('=')[1] || DEFAULT_SEED_PAGES)
const requestedLimit = Number(limitArg?.split('=')[1] || 0)

const pages = Number.isFinite(requestedPages)
  ? Math.max(1, Math.min(20, Math.trunc(requestedPages)))
  : DEFAULT_SEED_PAGES

const hardLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
  ? Math.max(1, Math.min(1000, Math.trunc(requestedLimit)))
  : null

if (!fs.existsSync(schemaPath)) {
  console.error('schema.sql not found')
  process.exit(1)
}

const schema = fs.readFileSync(schemaPath, 'utf-8')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function columnExists(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return columns.some((column) => column.name === columnName)
}

function ensureSchemaCompatibility(db) {
  if (!columnExists(db, 'animes', 'synopsis_en')) {
    db.exec('ALTER TABLE animes ADD COLUMN synopsis_en TEXT')
  }
}

function resetAnimeData(db) {
  db.exec('DELETE FROM anime_genres')
  db.exec('DELETE FROM genres')
  db.exec('DELETE FROM anime_tags')
  db.exec('DELETE FROM tags')
  db.exec('DELETE FROM serveurs')
  db.exec('DELETE FROM subtitles')
  db.exec('DELETE FROM episodes')
  db.exec('DELETE FROM animes')
}

function resetAllData(db) {
  const tableRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()

  const tableNames = tableRows
    .map((row) => row?.name)
    .filter((name) => typeof name === 'string' && name.trim().length > 0)

  db.exec('PRAGMA foreign_keys = OFF')

  try {
    db.exec('BEGIN')
    for (const tableName of tableNames) {
      db.exec(`DELETE FROM ${tableName}`)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

function parseDurationMinutes(durationLabel) {
  const match = String(durationLabel || '').match(/(\d+)\s*min/i)
  if (!match) return null
  const minutes = Number(match[1])
  return Number.isFinite(minutes) && minutes > 0 ? Math.trunc(minutes) : null
}

function mapJikanAnimeToRow(anime) {
  const englishTitle = String(anime?.title_english || anime?.title || anime?.title_japanese || '').trim()
  const japaneseTitle = String(anime?.title_japanese || '').trim()
  const synopsis = String(anime?.synopsis || '').trim()

  return {
    id: Number(anime?.mal_id),
    titre_ar: englishTitle || 'Untitled',
    titre_en: englishTitle || null,
    titre_jp: japaneseTitle || null,
    synopsis_ar: synopsis || null,
    synopsis_en: synopsis || null,
    poster_url: anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url || null,
    banner_url: anime?.trailer?.images?.maximum_image_url || anime?.images?.jpg?.large_image_url || null,
    format: anime?.type || null,
    statut: anime?.status || null,
    studio: anime?.studios?.[0]?.name || null,
    season: anime?.season || null,
    year: Number.isFinite(Number(anime?.year)) ? Math.trunc(Number(anime.year)) : null,
    jour_sortie: anime?.broadcast?.day || null,
    note_imdb: Number.isFinite(Number(anime?.score)) ? Number(anime.score) : null,
    age_rating: anime?.rating || null,
    total_episodes: Number.isFinite(Number(anime?.episodes)) ? Math.trunc(Number(anime.episodes)) : null,
    duree_episode: parseDurationMinutes(anime?.duration),
    genres: Array.isArray(anime?.genres) ? anime.genres.map((genre) => String(genre?.name || '').trim()).filter(Boolean) : []
  }
}

async function fetchTopAnimePages(pageCount) {
  const collected = []

  for (let page = 1; page <= pageCount; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(DEFAULT_PAGE_LIMIT)
    })

    const response = await fetch(`${TOP_ANIME_URL}?${query.toString()}`, {
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Top anime request failed on page ${page} (${response.status})`)
    }

    const payload = await response.json()
    const items = Array.isArray(payload?.data) ? payload.data : []
    collected.push(...items)

    if (!payload?.pagination?.has_next_page) {
      break
    }

    await sleep(300)
  }

  return collected
}

async function seedAnimes(db, { pageCount, itemLimit }) {
  const items = await fetchTopAnimePages(pageCount)
  const uniqueItems = []
  const seen = new Set()

  for (const item of items) {
    const id = Number(item?.mal_id)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    uniqueItems.push(item)
    if (itemLimit && uniqueItems.length >= itemLimit) break
  }

  const upsertAnime = db.prepare(`
    INSERT INTO animes (
      id, titre_ar, titre_en, titre_jp, synopsis_ar, synopsis_en,
      poster_url, banner_url, format, statut, studio, season, year,
      jour_sortie, note_imdb, age_rating, total_episodes, duree_episode
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      titre_ar = excluded.titre_ar,
      titre_en = excluded.titre_en,
      titre_jp = excluded.titre_jp,
      synopsis_ar = excluded.synopsis_ar,
      synopsis_en = excluded.synopsis_en,
      poster_url = excluded.poster_url,
      banner_url = excluded.banner_url,
      format = excluded.format,
      statut = excluded.statut,
      studio = excluded.studio,
      season = excluded.season,
      year = excluded.year,
      jour_sortie = excluded.jour_sortie,
      note_imdb = excluded.note_imdb,
      age_rating = excluded.age_rating,
      total_episodes = excluded.total_episodes,
      duree_episode = excluded.duree_episode
  `)

  const insertGenre = db.prepare('INSERT INTO genres (nom_ar) VALUES (?) ON CONFLICT(nom_ar) DO NOTHING')
  const getGenreId = db.prepare('SELECT id FROM genres WHERE nom_ar = ?')
  const insertAnimeGenre = db.prepare('INSERT INTO anime_genres (anime_id, genre_id) VALUES (?, ?) ON CONFLICT(anime_id, genre_id) DO NOTHING')

  let animeCount = 0
  let genreLinkCount = 0

  db.exec('BEGIN')

  try {
    for (const item of uniqueItems) {
      const row = mapJikanAnimeToRow(item)
      if (!Number.isFinite(row.id) || row.id <= 0) continue

      upsertAnime.run(
        row.id,
        row.titre_ar,
        row.titre_en,
        row.titre_jp,
        row.synopsis_ar,
        row.synopsis_en,
        row.poster_url,
        row.banner_url,
        row.format,
        row.statut,
        row.studio,
        row.season,
        row.year,
        row.jour_sortie,
        row.note_imdb,
        row.age_rating,
        row.total_episodes,
        row.duree_episode
      )

      animeCount += 1

      for (const genreName of row.genres) {
        insertGenre.run(genreName)
        const genre = getGenreId.get(genreName)
        if (!genre?.id) continue
        insertAnimeGenre.run(row.id, genre.id)
        genreLinkCount += 1
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return {
    animeCount,
    genreLinkCount
  }
}

async function main() {
  const db = new DatabaseSync(dbPath)

  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(schema)
    ensureSchemaCompatibility(db)

    console.log(`Database ready: ${dbPath}`)

    if (!shouldSeed) {
      return
    }

    if (shouldWipeAllData) {
      resetAllData(db)
      console.log('Wiped all table data')
    } else if (shouldResetAnimeData) {
      resetAnimeData(db)
      console.log('Reset anime-related data')
    }

    const result = await seedAnimes(db, {
      pageCount: pages,
      itemLimit: hardLimit
    })

    console.log(`Seeded animes: ${result.animeCount}`)
    console.log(`Linked genres: ${result.genreLinkCount}`)
  } finally {
    db.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

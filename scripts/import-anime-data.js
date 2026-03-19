#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDbPath = path.join(__dirname, '../src/renderer/database/anime.db')

const args = process.argv.slice(2)

const fileArg = args.find((arg) => arg.startsWith('--file='))
const dbArg = args.find((arg) => arg.startsWith('--db='))
const sourceArg = args.find((arg) => arg.startsWith('--source='))

const importFilePath = fileArg ? fileArg.slice('--file='.length).trim() : ''
const dbPath = dbArg ? dbArg.slice('--db='.length).trim() : defaultDbPath
const sourceName = sourceArg ? sourceArg.slice('--source='.length).trim() : 'manual-import'

const shouldReset = args.includes('--reset')
const isDryRun = args.includes('--dry-run')
const showHelp = args.includes('--help') || args.includes('-h')

function printHelp() {
  console.log('Anime importer')
  console.log('')
  console.log('Usage:')
  console.log('  node scripts/import-anime-data.js --file=<path-to-json> [--reset] [--dry-run] [--source=<name>] [--db=<path>]')
  console.log('')
  console.log('Flags:')
  console.log('  --file=...      Path to import JSON file (required)')
  console.log('  --reset         Clear anime-related tables before importing')
  console.log('  --dry-run       Validate and parse without writing to DB')
  console.log('  --source=...    Default server name when missing (default: manual-import)')
  console.log('  --db=...        Custom database path (default: src/renderer/database/anime.db)')
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

function asOptionalText(value) {
  const text = normalizeText(value, '')
  return text || null
}

function asOptionalInt(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.trunc(number)
}

function asOptionalFloat(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeGenres(input) {
  if (!Array.isArray(input)) return []

  return input
    .map((genre) => {
      if (typeof genre === 'string') return normalizeText(genre, '')
      return normalizeText(genre?.name || genre?.nom || genre?.nom_ar || '', '')
    })
    .filter(Boolean)
}

function ensureSynopsisEnColumn(db) {
  const columns = db.prepare('PRAGMA table_info(animes)').all()
  const hasColumn = columns.some((column) => column?.name === 'synopsis_en')
  if (!hasColumn) {
    db.exec('ALTER TABLE animes ADD COLUMN synopsis_en TEXT')
  }
}

function resetAnimeRelatedTables(db) {
  db.exec('DELETE FROM anime_genres')
  db.exec('DELETE FROM genres')
  db.exec('DELETE FROM anime_tags')
  db.exec('DELETE FROM tags')
  db.exec('DELETE FROM serveurs')
  db.exec('DELETE FROM subtitles')
  db.exec('DELETE FROM episodes')
  db.exec('DELETE FROM animes')
}

function parseImportPayload(rawPayload) {
  if (Array.isArray(rawPayload)) {
    return rawPayload
  }

  if (rawPayload && Array.isArray(rawPayload.animes)) {
    return rawPayload.animes
  }

  return []
}

function getAnimeIdentity(anime) {
  const id = asOptionalInt(anime?.id)
  const titleEn = normalizeText(anime?.titre_en || anime?.title_en || anime?.title || anime?.name || '', '')
  const titleAr = normalizeText(anime?.titre_ar || '', '')
  const titleJp = normalizeText(anime?.titre_jp || anime?.title_jp || '', '')
  const year = asOptionalInt(anime?.year)

  return { id, titleEn, titleAr, titleJp, year }
}

function createAnimeRow(anime) {
  const identity = getAnimeIdentity(anime)
  const titleForRequiredField =
    identity.titleAr || identity.titleEn || identity.titleJp || 'Untitled'
  const synopsis = normalizeText(anime?.synopsis_en || anime?.synopsis || anime?.description || '', '')

  return {
    id: identity.id,
    titre_ar: titleForRequiredField,
    titre_en: asOptionalText(identity.titleEn),
    titre_jp: asOptionalText(identity.titleJp),
    synopsis_ar: asOptionalText(anime?.synopsis_ar || synopsis),
    synopsis_en: asOptionalText(synopsis),
    poster_url: asOptionalText(anime?.poster_url || anime?.poster || anime?.image),
    banner_url: asOptionalText(anime?.banner_url || anime?.banner),
    format: asOptionalText(anime?.format || anime?.type),
    statut: asOptionalText(anime?.statut || anime?.status),
    studio: asOptionalText(anime?.studio),
    season: asOptionalText(anime?.season),
    year: identity.year,
    jour_sortie: asOptionalText(anime?.jour_sortie || anime?.release_day),
    note_imdb: asOptionalFloat(anime?.note_imdb || anime?.score || anime?.rating),
    age_rating: asOptionalText(anime?.age_rating),
    total_episodes: asOptionalInt(anime?.total_episodes || anime?.episodes),
    duree_episode: asOptionalInt(anime?.duree_episode || anime?.episode_duration),
    genres: normalizeGenres(anime?.genres),
    episodes: Array.isArray(anime?.episodes) ? anime.episodes : []
  }
}

function getEpisodeNumber(episode, fallbackIndex) {
  const number = asOptionalInt(episode?.numero || episode?.number || episode?.episode)
  return Number.isFinite(number) && number > 0 ? number : fallbackIndex + 1
}

function normalizeServers(servers, defaultServerName) {
  if (!Array.isArray(servers)) return []

  return servers
    .map((server) => ({
      nom_serveur: normalizeText(server?.nom_serveur || server?.name || defaultServerName, defaultServerName),
      qualite: asOptionalText(server?.qualite || server?.quality || server?.resolution),
      langue: asOptionalText(server?.langue || server?.language || 'ar'),
      url_video: normalizeText(server?.url_video || server?.url || server?.stream_url, '')
    }))
    .filter((server) => Boolean(server.url_video))
}

function normalizeEpisodes(episodes, defaultServerName) {
  return (episodes || []).map((episode, index) => ({
    numero: getEpisodeNumber(episode, index),
    titre_ar: asOptionalText(episode?.titre_ar || episode?.title || episode?.name || `Episode ${index + 1}`),
    description: asOptionalText(episode?.description || episode?.synopsis),
    is_filler: episode?.is_filler ? 1 : 0,
    date_sortie: asOptionalText(episode?.date_sortie || episode?.release_date),
    serveurs: normalizeServers(
      episode?.serveurs || episode?.servers || episode?.streams || [],
      defaultServerName
    )
  }))
}

function main() {
  if (showHelp) {
    printHelp()
    process.exit(0)
  }

  if (!importFilePath) {
    console.error('Missing required --file argument')
    printHelp()
    process.exit(1)
  }

  const absoluteImportFilePath = path.resolve(process.cwd(), importFilePath)
  if (!fs.existsSync(absoluteImportFilePath)) {
    console.error(`Import file not found: ${absoluteImportFilePath}`)
    process.exit(1)
  }

  const rawContent = fs.readFileSync(absoluteImportFilePath, 'utf-8')
  let payload
  try {
    payload = JSON.parse(rawContent)
  } catch (error) {
    console.error('Invalid JSON file')
    process.exit(1)
  }

  const animeEntries = parseImportPayload(payload)
  if (!animeEntries.length) {
    console.error('No animes found in import payload (expected array or { animes: [] })')
    process.exit(1)
  }

  if (isDryRun) {
    const episodeCount = animeEntries.reduce((count, anime) => count + (Array.isArray(anime?.episodes) ? anime.episodes.length : 0), 0)
    console.log(`Dry run OK - animes: ${animeEntries.length}, episodes: ${episodeCount}`)
    process.exit(0)
  }

  const db = new DatabaseSync(path.resolve(process.cwd(), dbPath))

  const stats = {
    animeInserted: 0,
    animeUpdated: 0,
    genreLinked: 0,
    episodesUpserted: 0,
    serversUpserted: 0
  }

  try {
    db.exec('PRAGMA foreign_keys = ON')
    ensureSynopsisEnColumn(db)

    if (shouldReset) {
      resetAnimeRelatedTables(db)
      console.log('Reset anime-related tables')
    }

    const selectAnimeById = db.prepare('SELECT id FROM animes WHERE id = ?')
    const selectAnimeByTitle = db.prepare(`
      SELECT id
      FROM animes
      WHERE lower(COALESCE(titre_en, titre_ar, '')) = lower(?)
        AND (? IS NULL OR year = ?)
      LIMIT 1
    `)

    const insertAnimeWithId = db.prepare(`
      INSERT INTO animes (
        id, titre_ar, titre_en, titre_jp, synopsis_ar, synopsis_en,
        poster_url, banner_url, format, statut, studio, season,
        year, jour_sortie, note_imdb, age_rating, total_episodes, duree_episode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertAnimeAutoId = db.prepare(`
      INSERT INTO animes (
        titre_ar, titre_en, titre_jp, synopsis_ar, synopsis_en,
        poster_url, banner_url, format, statut, studio, season,
        year, jour_sortie, note_imdb, age_rating, total_episodes, duree_episode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const updateAnime = db.prepare(`
      UPDATE animes
      SET titre_ar = ?,
          titre_en = ?,
          titre_jp = ?,
          synopsis_ar = ?,
          synopsis_en = ?,
          poster_url = ?,
          banner_url = ?,
          format = ?,
          statut = ?,
          studio = ?,
          season = ?,
          year = ?,
          jour_sortie = ?,
          note_imdb = ?,
          age_rating = ?,
          total_episodes = ?,
          duree_episode = ?
      WHERE id = ?
    `)

    const insertGenre = db.prepare('INSERT INTO genres (nom_ar) VALUES (?) ON CONFLICT(nom_ar) DO NOTHING')
    const selectGenre = db.prepare('SELECT id FROM genres WHERE nom_ar = ?')
    const linkAnimeGenre = db.prepare('INSERT INTO anime_genres (anime_id, genre_id) VALUES (?, ?) ON CONFLICT(anime_id, genre_id) DO NOTHING')

    const selectEpisodeByAnimeAndNumber = db.prepare(
      'SELECT id FROM episodes WHERE anime_id = ? AND numero = ? ORDER BY id DESC LIMIT 1'
    )
    const insertEpisode = db.prepare(
      'INSERT INTO episodes (anime_id, numero, titre_ar, description, is_filler, date_sortie) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const updateEpisode = db.prepare(
      'UPDATE episodes SET titre_ar = ?, description = ?, is_filler = ?, date_sortie = ? WHERE id = ?'
    )

    const selectServerByEpisodeAndUrl = db.prepare(
      'SELECT id FROM serveurs WHERE episode_id = ? AND url_video = ? LIMIT 1'
    )
    const insertServer = db.prepare(
      'INSERT INTO serveurs (episode_id, nom_serveur, qualite, langue, url_video) VALUES (?, ?, ?, ?, ?)'
    )
    const updateServer = db.prepare(
      'UPDATE serveurs SET nom_serveur = ?, qualite = ?, langue = ? WHERE id = ?'
    )

    db.exec('BEGIN')

    for (const animeEntry of animeEntries) {
      const anime = createAnimeRow(animeEntry)
      if (!anime.titre_ar) continue

      let animeId = null

      if (anime.id) {
        const existing = selectAnimeById.get(anime.id)
        if (existing?.id) {
          updateAnime.run(
            anime.titre_ar,
            anime.titre_en,
            anime.titre_jp,
            anime.synopsis_ar,
            anime.synopsis_en,
            anime.poster_url,
            anime.banner_url,
            anime.format,
            anime.statut,
            anime.studio,
            anime.season,
            anime.year,
            anime.jour_sortie,
            anime.note_imdb,
            anime.age_rating,
            anime.total_episodes,
            anime.duree_episode,
            anime.id
          )
          animeId = anime.id
          stats.animeUpdated += 1
        } else {
          insertAnimeWithId.run(
            anime.id,
            anime.titre_ar,
            anime.titre_en,
            anime.titre_jp,
            anime.synopsis_ar,
            anime.synopsis_en,
            anime.poster_url,
            anime.banner_url,
            anime.format,
            anime.statut,
            anime.studio,
            anime.season,
            anime.year,
            anime.jour_sortie,
            anime.note_imdb,
            anime.age_rating,
            anime.total_episodes,
            anime.duree_episode
          )
          animeId = anime.id
          stats.animeInserted += 1
        }
      } else {
        const identityTitle = anime.titre_en || anime.titre_ar
        const existing = selectAnimeByTitle.get(identityTitle, anime.year, anime.year)
        if (existing?.id) {
          animeId = existing.id
          updateAnime.run(
            anime.titre_ar,
            anime.titre_en,
            anime.titre_jp,
            anime.synopsis_ar,
            anime.synopsis_en,
            anime.poster_url,
            anime.banner_url,
            anime.format,
            anime.statut,
            anime.studio,
            anime.season,
            anime.year,
            anime.jour_sortie,
            anime.note_imdb,
            anime.age_rating,
            anime.total_episodes,
            anime.duree_episode,
            animeId
          )
          stats.animeUpdated += 1
        } else {
          const result = insertAnimeAutoId.run(
            anime.titre_ar,
            anime.titre_en,
            anime.titre_jp,
            anime.synopsis_ar,
            anime.synopsis_en,
            anime.poster_url,
            anime.banner_url,
            anime.format,
            anime.statut,
            anime.studio,
            anime.season,
            anime.year,
            anime.jour_sortie,
            anime.note_imdb,
            anime.age_rating,
            anime.total_episodes,
            anime.duree_episode
          )
          animeId = Number(result.lastInsertRowid)
          stats.animeInserted += 1
        }
      }

      if (!animeId) continue

      for (const genreName of anime.genres) {
        insertGenre.run(genreName)
        const genre = selectGenre.get(genreName)
        if (!genre?.id) continue
        linkAnimeGenre.run(animeId, genre.id)
        stats.genreLinked += 1
      }

      const episodes = normalizeEpisodes(anime.episodes, sourceName)
      for (const episode of episodes) {
        const existingEpisode = selectEpisodeByAnimeAndNumber.get(animeId, episode.numero)
        let episodeId

        if (existingEpisode?.id) {
          episodeId = existingEpisode.id
          updateEpisode.run(
            episode.titre_ar,
            episode.description,
            episode.is_filler,
            episode.date_sortie,
            episodeId
          )
        } else {
          const result = insertEpisode.run(
            animeId,
            episode.numero,
            episode.titre_ar,
            episode.description,
            episode.is_filler,
            episode.date_sortie
          )
          episodeId = Number(result.lastInsertRowid)
        }

        stats.episodesUpserted += 1

        for (const server of episode.serveurs) {
          const existingServer = selectServerByEpisodeAndUrl.get(episodeId, server.url_video)
          if (existingServer?.id) {
            updateServer.run(server.nom_serveur, server.qualite, server.langue, existingServer.id)
          } else {
            insertServer.run(
              episodeId,
              server.nom_serveur,
              server.qualite,
              server.langue,
              server.url_video
            )
          }
          stats.serversUpserted += 1
        }
      }
    }

    db.exec('COMMIT')

    console.log(`Import complete from: ${absoluteImportFilePath}`)
    console.log(`Anime inserted: ${stats.animeInserted}`)
    console.log(`Anime updated: ${stats.animeUpdated}`)
    console.log(`Genre links upserted: ${stats.genreLinked}`)
    console.log(`Episodes upserted: ${stats.episodesUpserted}`)
    console.log(`Servers upserted: ${stats.serversUpserted}`)
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ignore rollback failures
    }

    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    db.close()
  }
}

main()
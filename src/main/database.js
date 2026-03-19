import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db = null
let activeDbPath = null

const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3']

/** Returns path to bundled database in src/renderer/database (dev) or resources/database (packaged) */
export function getBundledDbPath() {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'database')
    : path.join(app.getAppPath(), 'src', 'renderer', 'database')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  const dbFile = files.find((f) => DB_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
  return dbFile ? path.join(dir, dbFile) : null
}

export function openDatabase(dbPath) {
  if (db) {
    db.close()
    db = null
    activeDbPath = null
  }
  db = new Database(dbPath, { readonly: true })
  activeDbPath = dbPath
  return true
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
    activeDbPath = null
  }
}

export function isDatabaseOpen() {
  return db !== null
}

export function getActiveDatabasePath() {
  return activeDbPath
}

export function getAnimes(search = '') {
  if (!db) return []
  let stmt
  if (search.trim()) {
    const q = `%${search.trim()}%`
    stmt = db.prepare(`
      SELECT * FROM animes 
      WHERE titre_ar LIKE ? OR titre_en LIKE ? OR titre_jp LIKE ?
      ORDER BY date_ajout DESC
    `)
    return stmt.all(q, q, q)
  }
  stmt = db.prepare('SELECT * FROM animes ORDER BY date_ajout DESC')
  return stmt.all()
}

export function getAnimesLite(search = '', limit = 200) {
  if (!db) return []

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(2500, Math.trunc(Number(limit))))
    : 200

  let stmt
  if (search.trim()) {
    const q = `%${search.trim()}%`
    stmt = db.prepare(`
      SELECT
        id,
        titre_en,
        titre_jp,
        poster_url,
        note_imdb,
        substr(COALESCE(synopsis_en, ''), 1, 320) AS synopsis_en,
        format,
        statut,
        total_episodes,
        year
      FROM animes
      WHERE titre_ar LIKE ? OR titre_en LIKE ? OR titre_jp LIKE ?
      ORDER BY date_ajout DESC
      LIMIT ?
    `)
    return stmt.all(q, q, q, safeLimit)
  }

  stmt = db.prepare(`
    SELECT
      id,
      titre_en,
      titre_jp,
      poster_url,
      note_imdb,
      substr(COALESCE(synopsis_en, ''), 1, 320) AS synopsis_en,
      format,
      statut,
      total_episodes,
      year
    FROM animes
    ORDER BY date_ajout DESC
    LIMIT ?
  `)
  return stmt.all(safeLimit)
}

export function getAnimeById(id) {
  if (!db) return null
  const anime = db.prepare('SELECT * FROM animes WHERE id = ?').get(id)
  if (!anime) return null
  const genres = db
    .prepare(
      `
    SELECT g.nom_ar FROM genres g
    JOIN anime_genres ag ON ag.genre_id = g.id
    WHERE ag.anime_id = ?
  `
    )
    .all(id)
  const tags = db
    .prepare(
      `
    SELECT t.nom FROM tags t
    JOIN anime_tags at ON at.tag_id = t.id
    WHERE at.anime_id = ?
  `
    )
    .all(id)
  return { ...anime, genres: genres.map((g) => g.nom_ar), tags: tags.map((t) => t.nom) }
}

export function getEpisodes(animeId) {
  if (!db) return []
  const episodes = db
    .prepare('SELECT * FROM episodes WHERE anime_id = ? ORDER BY numero')
    .all(animeId)
  return episodes.map((ep) => {
    const serveurs = db
      .prepare(
        'SELECT id, nom_serveur, qualite, langue, url_video FROM serveurs WHERE episode_id = ?'
      )
      .all(ep.id)
    return { ...ep, serveurs }
  })
}

export function getLatestEpisodes(limit = 24) {
  if (!db) return []

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(100, Math.trunc(Number(limit))))
    : 24

  return db
    .prepare(
      `
      SELECT
        e.id AS episode_id,
        e.anime_id,
        e.numero,
        e.titre_ar AS episode_title,
        e.date_sortie,
        COALESCE(e.date_sortie, a.date_ajout) AS uploaded_at,
        a.titre_en,
        a.titre_jp,
        a.poster_url,
        a.note_imdb,
        a.format,
        a.statut,
        a.total_episodes,
        a.year
      FROM episodes e
      INNER JOIN animes a ON a.id = e.anime_id
      ORDER BY datetime(COALESCE(e.date_sortie, a.date_ajout)) DESC, e.id DESC
      LIMIT ?
      `
    )
    .all(safeLimit)
}

export function getSubtitles(episodeId) {
  if (!db) return []
  return db.prepare('SELECT * FROM subtitles WHERE episode_id = ?').all(episodeId)
}

import { getArabicSourceById, listArabicSources } from './arabic-sources.js'

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

function requireArabicSource(sourceId) {
  const source = getArabicSourceById(sourceId)
  if (!source) {
    throw new Error(
      `Unsupported source: ${sourceId || '(empty)'}. Only configured Arabic sources are allowed.`
    )
  }
  return source
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function asAbsoluteUrl(rawUrl, baseUrl) {
  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return ''
  }
}

function isDirectMediaUrl(url) {
  return /\.(m3u8|mp4)(\?|$)/i.test(String(url || ''))
}

function parseEpisodeNumber(value, fallbackIndex = 0) {
  const text = String(value || '')
  const match = text.match(/(?:episode|ep|الحلقة)\s*[-:#]?\s*(\d{1,4})/i)
  if (match) {
    const number = Number(match[1])
    if (Number.isFinite(number) && number > 0) return Math.trunc(number)
  }

  const loose = text.match(/\b(\d{1,4})\b/)
  if (loose) {
    const number = Number(loose[1])
    if (Number.isFinite(number) && number > 0) return Math.trunc(number)
  }

  return fallbackIndex + 1
}

function extractThumbnail(item = {}) {
  const yoastImage = item?.yoast_head_json?.og_image?.[0]?.url
  if (yoastImage) return yoastImage

  const rendered = String(item?.content?.rendered || '')
  const imgMatch = rendered.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch?.[1]) return imgMatch[1]

  return ''
}

function extractSearchTitle(item = {}) {
  const rendered = stripHtml(item?.title?.rendered || '')
  if (rendered) return rendered

  const yoastTitle = stripHtml(item?.yoast_head_json?.title || '').replace(/\s*[-|]\s*WITANIME.*$/i, '').trim()
  if (yoastTitle) return yoastTitle

  const slug = normalizeText(item?.slug || '', '')
  if (!slug) return 'Untitled'

  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pickSourceHostOrThrow(url, source) {
  try {
    const targetHost = new URL(url).host.toLowerCase()
    const sourceHost = new URL(source.baseUrl).host.toLowerCase()
    if (targetHost !== sourceHost) {
      throw new Error('Cross-source URL is not allowed')
    }
    return url
  } catch {
    throw new Error('Invalid or unsupported source URL')
  }
}

async function fetchText(url, source) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: source.referer,
      'User-Agent': source.userAgent
    }
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  return response.text()
}

async function fetchJson(url, source) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: source.referer,
      'User-Agent': source.userAgent
    }
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  return response.json()
}

function readInlineVar(html, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*['\"]([^'\"]+)['\"]`, 'i')
  const match = String(html || '').match(regex)
  return match?.[1] || ''
}

function decodeXorPayload(token) {
  if (typeof token !== 'string' || !token.includes('.')) return []

  const [encodedPayload, encodedKey] = token.split('.')
  if (!encodedPayload || !encodedKey) return []

  const payloadBuffer = Buffer.from(encodedPayload, 'base64')
  const keyBuffer = Buffer.from(encodedKey, 'base64')
  if (!payloadBuffer.length || !keyBuffer.length) return []

  const outputBuffer = Buffer.alloc(payloadBuffer.length)
  for (let index = 0; index < payloadBuffer.length; index += 1) {
    outputBuffer[index] = payloadBuffer[index] ^ keyBuffer[index % keyBuffer.length]
  }

  try {
    const parsed = JSON.parse(outputBuffer.toString('utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function decodeProcessedEpisodeData(html) {
  const token = readInlineVar(html, 'processedEpisodeData')
  return decodeXorPayload(token)
}

function decodeOpenEpisodeLinks(html, source) {
  const links = []
  const regex = /openEpisode\('([^']+)'\)/g
  let match

  while ((match = regex.exec(String(html || '')))) {
    const encoded = match[1]
    let decoded = ''
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    } catch {
      decoded = ''
    }

    const absolute = asAbsoluteUrl(decoded, source.baseUrl)
    if (absolute) links.push(absolute)
  }

  return [...new Set(links)]
}

function parseBase64JsonArray(html, variableName) {
  const encoded = readInlineVar(html, variableName)
  if (!encoded) return []

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function decodeEncodedServerUrl(resourceEntry, configEntry) {
  if (typeof resourceEntry !== 'string' || !configEntry || typeof configEntry !== 'object') return ''

  const indexRaw = Buffer.from(String(configEntry.k || ''), 'base64').toString('utf-8')
  const index = Number.parseInt(indexRaw, 10)
  const offset = Array.isArray(configEntry.d) ? Number(configEntry.d[index] || 0) : 0

  const cleaned = resourceEntry
    .split('')
    .reverse()
    .join('')
    .replace(/[^A-Za-z0-9+/=]/g, '')

  let decoded = Buffer.from(cleaned, 'base64').toString('utf-8')
  if (Number.isFinite(offset) && offset > 0) {
    decoded = decoded.slice(0, -offset)
  }

  if (/^https:\/\/yonaplay\.net\/embed\.php\?id=\d+$/.test(decoded)) {
    decoded = `${decoded}&apiKey=1c0f3441-e3c2-4023-9e8b-bee77ff59adf`
  }

  return decoded
}

function extractServerLabels(html) {
  const labels = []
  const regex =
    /<a[^>]*class=["'][^"']*server-link[^"']*["'][^>]*data-server-id=["'](\d+)["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*ser[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi

  let match
  while ((match = regex.exec(String(html || '')))) {
    const id = Number.parseInt(match[1], 10)
    const label = stripHtml(match[2])
    if (Number.isFinite(id)) {
      labels.push({ id, label })
    }
  }

  return labels
}

function qualityFromText(value) {
  const text = String(value || '').toLowerCase()
  if (/\b(2160p|4k|uhd)\b/.test(text)) return '2160'
  if (/\b(1440p|2k)\b/.test(text)) return '1440'
  if (/\b1080p\b/.test(text)) return '1080'
  if (/\b(720p|hd)\b/.test(text)) return '720'
  if (/\b480p\b/.test(text)) return '480'
  if (/\b360p\b/.test(text)) return '360'
  return ''
}

function normalizeAnimeUrl(animeId, source) {
  const normalized = normalizeText(animeId, '')
  if (!normalized) throw new Error('animeId is required')

  if (/^https?:\/\//i.test(normalized)) {
    return pickSourceHostOrThrow(normalized, source)
  }

  if (/^\d+$/.test(normalized)) {
    return `${source.baseUrl}/?p=${normalized}`
  }

  return `${source.baseUrl}/anime/${normalized.replace(/^\/+|\/+$/g, '')}/`
}

function normalizeEpisodeUrl(episodeId, source) {
  const normalized = normalizeText(episodeId, '')
  if (!normalized) throw new Error('episodeId is required')

  if (/^https?:\/\//i.test(normalized)) {
    return pickSourceHostOrThrow(normalized, source)
  }

  return `${source.baseUrl}/episode/${normalized.replace(/^\/+|\/+$/g, '')}/`
}

export class ScraperService {
  listSources() {
    return listArabicSources()
  }

  async searchAnime({ query = '', sourceId = 'witanime' } = {}) {
    const source = requireArabicSource(sourceId)
    const normalizedQuery = normalizeText(query, '')

    if (!normalizedQuery) {
      return {
        sourceId: source.id,
        language: source.language,
        query: normalizedQuery,
        items: []
      }
    }

    const searchParams = new URLSearchParams({
      search: normalizedQuery,
      per_page: '20',
      _fields: 'id,link,slug,title,yoast_head_json,featured_media'
    })

    const wpApiUrl = `${source.baseUrl}/wp-json/wp/v2/anime?${searchParams.toString()}`
    const payload = await fetchJson(wpApiUrl, source)
    const list = Array.isArray(payload) ? payload : []

    const items = list
      .map((item) => {
        const link = asAbsoluteUrl(item?.link || '', source.baseUrl)
        if (!link) return null

        return {
          id: link,
          sourceAnimeId: String(item?.id || ''),
          slug: normalizeText(item?.slug || '', ''),
          title: extractSearchTitle(item),
          coverImage: extractThumbnail(item),
          sourceId: source.id,
          language: source.language
        }
      })
      .filter(Boolean)

    return {
      sourceId: source.id,
      language: source.language,
      query: normalizedQuery,
      items
    }
  }

  async getEpisodes({ animeId = '', sourceId = 'witanime' } = {}) {
    const source = requireArabicSource(sourceId)
    const animeUrl = normalizeAnimeUrl(animeId, source)
    const html = await fetchText(animeUrl, source)

    const fromEncoded = decodeProcessedEpisodeData(html)
      .map((item, index) => {
        const url = asAbsoluteUrl(item?.url || '', source.baseUrl)
        if (!url) return null

        const number = parseEpisodeNumber(`${item?.number || ''} ${item?.title || ''} ${url}`, index)
        const title = stripHtml(item?.title || '') || `Episode ${number}`

        return {
          id: url,
          episodeId: url,
          number,
          title,
          sourceId: source.id,
          language: source.language
        }
      })
      .filter(Boolean)

    const fromOpenEpisode = decodeOpenEpisodeLinks(html, source).map((url, index) => ({
      id: url,
      episodeId: url,
      number: parseEpisodeNumber(url, index),
      title: `Episode ${parseEpisodeNumber(url, index)}`,
      sourceId: source.id,
      language: source.language
    }))

    const byId = new Map()
    for (const episode of [...fromEncoded, ...fromOpenEpisode]) {
      if (!episode?.id) continue
      if (!byId.has(episode.id)) {
        byId.set(episode.id, episode)
        continue
      }

      const current = byId.get(episode.id)
      if ((!current.title || /^Episode\s+\d+$/i.test(current.title)) && episode.title) {
        current.title = episode.title
      }
      if (!current.number && episode.number) {
        current.number = episode.number
      }
    }

    const episodes = [...byId.values()].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))

    return {
      sourceId: source.id,
      language: source.language,
      animeId: animeUrl,
      episodes
    }
  }

  async resolveStream({ episodeId = '', sourceId = 'witanime' } = {}) {
    const source = requireArabicSource(sourceId)
    const episodeUrl = normalizeEpisodeUrl(episodeId, source)
    const html = await fetchText(episodeUrl, source)

    const resourceRegistry = parseBase64JsonArray(html, '_zG')
    const configRegistry = parseBase64JsonArray(html, '_zH')
    const serverLabels = extractServerLabels(html)

    const streams = []

    for (const { id, label } of serverLabels) {
      const decoded = decodeEncodedServerUrl(resourceRegistry[id], configRegistry[id])
      if (!decoded) continue

      const absolute = asAbsoluteUrl(decoded, source.baseUrl)
      if (!absolute) continue

      streams.push({
        id: String(id),
        label,
        quality: qualityFromText(label) || qualityFromText(absolute),
        url: absolute,
        isDirectMedia: isDirectMediaUrl(absolute)
      })
    }

    const uniqueStreams = []
    const seen = new Set()
    for (const stream of streams) {
      if (!stream.url || seen.has(stream.url)) continue
      seen.add(stream.url)
      uniqueStreams.push(stream)
    }

    const directMedia = uniqueStreams.filter((stream) => stream.isDirectMedia)
    const preferred = directMedia[0] || uniqueStreams[0] || null

    return {
      sourceId: source.id,
      language: source.language,
      episodeId: episodeUrl,
      streamUrl: preferred?.url || '',
      isDirectMedia: Boolean(preferred?.isDirectMedia),
      streams: uniqueStreams,
      headers: {
        Referer: source.referer,
        'User-Agent': source.userAgent
      }
    }
  }
}

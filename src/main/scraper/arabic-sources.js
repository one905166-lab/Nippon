const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export const ARABIC_SOURCES = [
  {
    id: 'witanime',
    name: 'WitAnime',
    language: 'ar',
    baseUrl: 'https://witanime.you',
    referer: 'https://witanime.you/',
    userAgent: DEFAULT_USER_AGENT
  }
]

export function listArabicSources() {
  return ARABIC_SOURCES.map((source) => ({
    id: source.id,
    name: source.name,
    language: source.language,
    baseUrl: source.baseUrl
  }))
}

export function getArabicSourceById(sourceId = '') {
  const id = String(sourceId || '')
    .trim()
    .toLowerCase()
  if (!id) return null
  return ARABIC_SOURCES.find((source) => source.id === id) || null
}

export function findArabicSourceByUrl(url) {
  let host = ''
  try {
    host = new URL(url).host.toLowerCase()
  } catch {
    return null
  }

  return (
    ARABIC_SOURCES.find((source) => {
      try {
        const sourceHost = new URL(source.baseUrl).host.toLowerCase()
        return sourceHost === host
      } catch {
        return false
      }
    }) || null
  )
}

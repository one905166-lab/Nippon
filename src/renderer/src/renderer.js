import '../assets/main.css'

const grid = document.getElementById('anime-grid')
const topRatedGrid = document.getElementById('top-rated-grid')
const homeLoadingEl = document.getElementById('home-loading')
const topRatedLoadingEl = document.getElementById('top-rated-loading')
const animeDetailEl = document.getElementById('anime-detail')
const episodesListEl = document.getElementById('episodes-list')
const videoPlayer = document.getElementById('video-player')
const playerContainerEl = document.querySelector('.player-container')
const playerPrevEpisodeBtn = document.getElementById('player-prev-episode')
const playerToggleBtn = document.getElementById('player-toggle')
const playerNextEpisodeBtn = document.getElementById('player-next-episode')
const playerRewindBtn = document.getElementById('player-rewind')
const playerForwardBtn = document.getElementById('player-forward')
const playerSeekEl = document.getElementById('player-seek')
const playerTimeEl = document.getElementById('player-time')
const playerControlsEl = document.getElementById('custom-player-controls')
const playerMuteBtn = document.getElementById('player-mute')
const playerVolumeEl = document.getElementById('player-volume')
const playerSettingsToggleBtn = document.getElementById('player-settings-toggle')
const playerSettingsMenuEl = document.getElementById('player-settings-menu')
const playerQualityEl = document.getElementById('player-quality')
const playerSpeedEl = document.getElementById('player-speed')
const playerCopyStreamBtn = document.getElementById('player-copy-stream')
const playerCopyEpisodeBtn = document.getElementById('player-copy-episode')
const playerCopyTimeBtn = document.getElementById('player-copy-time')
const playerPipBtn = document.getElementById('player-pip')
const playerFullscreenBtn = document.getElementById('player-fullscreen')
const playerShortcutHintEl = document.getElementById('player-shortcut-hint')
const playerShortcutIconEl = document.getElementById('player-shortcut-icon')
const playerShortcutTextEl = document.getElementById('player-shortcut-text')
const playerAnimeTitleEl = document.getElementById('player-anime-title')
const playerEpisodeTitleEl = document.getElementById('player-episode-title')
const playerYourRatingEl = document.getElementById('player-your-rating')
const playerAppRatingEl = document.getElementById('player-app-rating')
const playerRateButtons = Array.from(document.querySelectorAll('.player-rate-btn'))
const playerCommentsListEl = document.getElementById('player-comments-list')
const playerCommentsCountEl = document.getElementById('player-comments-count')
const playerCommentInputEl = document.getElementById('player-comment-input')
const playerCommentSendBtn = document.getElementById('player-comment-send')
const playerEmojiToggleBtn = document.getElementById('player-emoji-toggle')
const playerEmojiPickerEl = document.getElementById('player-emoji-picker')
const playerEmojiButtons = Array.from(document.querySelectorAll('.player-emoji-btn'))
const mainContentEl = document.querySelector('.main-content')
const libraryViewEl = document.getElementById('view-library')
const topRatedViewEl = document.getElementById('view-top-rated')
const searchTopInputEl = document.getElementById('search-top-input')
const searchRecommendedGridEl = document.getElementById('search-recommended-grid')
const searchRecommendedLabelEl = document.getElementById('search-recommended-label')
const minimizeBtn = document.getElementById('win-minimize')
const maximizeBtn = document.getElementById('win-maximize')
const closeBtn = document.getElementById('win-close')

let homeLatestEpisodes = []
let topRatedAnimes = []
let topRatedCatalogAnimes = []
let searchRecommendedAnimes = []
let searchCurrentResultsAnimes = []
let detailReturnView = 'library'
let homeHasMore = false
let homeIsLoadingMore = false
let topRatedNextPage = 1
let topRatedHasMore = false
let topRatedIsLoadingMore = false
let searchInputDebounceTimer = null
let searchQueryRequestId = 0
let searchDbPoolPromise = null
let searchDbPoolAnimes = []
let searchDbPoolCleanupTimer = null
let scrollTicking = false
let playerEpisodeQueue = []
let playerEpisodeIndex = -1
let playerEpisodeAnime = null
let playerSelectedQuality = 'auto'
let playerShortcutHintTimer = null
let playerControlsIdleTimer = null

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php'
const HOME_LIMIT = 24
const TOP_RATED_INITIAL_LIMIT = 24
const TOP_RATED_LIMIT = 100
const TOP_RATED_PAGE_SIZE = 25
const SCROLL_BOTTOM_THRESHOLD = 120
const SEARCH_INPUT_DEBOUNCE_MS = 200
const SEARCH_FUZZY_LIMIT = 32
const SEARCH_FUZZY_MIN_SCORE = 0.32
const SEARCH_DB_DIRECT_LIMIT = 180
const SCRAPER_SEARCH_LIMIT = 24
const SCRAPER_DEFAULT_SOURCE_ID = 'witanime'
const SEARCH_DB_POOL_MAX_ITEMS = 1200
const SEARCH_DB_POOL_CACHE_TTL_MS = 45000
const COMMONS_EPISODE_SOURCES_CACHE_MAX = 72
const MAX_ANIME_SYNOPSIS_CHARS = 320
const MAX_ANIME_GENRES = 5
const PLAYER_CONTROLS_IDLE_MS = 1800
const PLAYER_RATING_STORAGE_KEY = 'nippon-player-ratings-v1'
const PLAYER_COMMENTS_STORAGE_KEY = 'nippon-player-comments-v1'
const DEFAULT_POSTER_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%231b1f26'/%3E%3Cstop offset='100%25' stop-color='%23111216'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='450' fill='url(%23g)'/%3E%3Ctext x='150' y='225' text-anchor='middle' dominant-baseline='middle' font-family='Segoe UI,Arial,sans-serif' font-size='24' fill='%238792a3'%3ENo Poster%3C/text%3E%3C/svg%3E"
const PLAYER_RATING_SEED = {
  'ep-1': { avg: 8.3, votes: 248 },
  'ep-2': { avg: 7.6, votes: 139 },
  'ep-3': { avg: 8.1, votes: 177 }
}
const commonsEpisodeSourcesCache = new Map()
const episodeQueueCache = new Map()

function setCommonsEpisodeSourcesCache(cacheKey, cacheValue) {
  if (!cacheKey) return

  if (commonsEpisodeSourcesCache.has(cacheKey)) {
    commonsEpisodeSourcesCache.delete(cacheKey)
  }

  commonsEpisodeSourcesCache.set(cacheKey, cacheValue)

  if (commonsEpisodeSourcesCache.size <= COMMONS_EPISODE_SOURCES_CACHE_MAX) return

  const oldestKey = commonsEpisodeSourcesCache.keys().next().value
  if (oldestKey !== undefined) {
    commonsEpisodeSourcesCache.delete(oldestKey)
  }
}

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/g

function cleanEnglishText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const cleaned = String(value).replace(ARABIC_CHAR_REGEX, '').replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}

function cleanDisplayText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const cleaned = String(value).replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}

function getAnimePosterUrl(anime) {
  const posterUrl = cleanDisplayText(anime?.poster_url, '')
  return posterUrl || DEFAULT_POSTER_PLACEHOLDER
}

function truncateText(value, maxLength = MAX_ANIME_SYNOPSIS_CHARS) {
  const text = cleanEnglishText(value, '')
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeAnimeGenres(genres) {
  if (!Array.isArray(genres)) return []

  return genres
    .map((genre) => {
      if (typeof genre === 'string') return cleanEnglishText(genre, '')
      return cleanEnglishText(genre?.name || genre?.nom || genre?.nom_ar || '', '')
    })
    .filter(Boolean)
    .slice(0, MAX_ANIME_GENRES)
}

function normalizeStatus(value) {
  const map = {
    watching: 'Watching',
    completed: 'Completed',
    plan_to_watch: 'Plan to Watch',
    dropped: 'Dropped'
  }
  return map[value] || cleanEnglishText(value, '')
}

function formatCount(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  return String(Math.trunc(number))
}

function formatScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  return number.toFixed(2).replace('.', ',')
}

function formatEpisodeTitleForHome(rawTitle, episodeNumber) {
  const title = cleanEnglishText(rawTitle, '')
  if (!title) {
    const safeFallbackNumber = Number(episodeNumber)
    return Number.isFinite(safeFallbackNumber) && safeFallbackNumber > 0
      ? `Episode ${Math.trunc(safeFallbackNumber)}`
      : 'Episode'
  }

  const safeEpisodeNumber =
    Number.isFinite(Number(episodeNumber)) && Number(episodeNumber) > 0
      ? Math.trunc(Number(episodeNumber))
      : null

  let normalizedTitle = title

  if (safeEpisodeNumber !== null) {
    const exactPrefixRegex = new RegExp(
      `^(?:episode|ep\\.?|e)\\s*0*${safeEpisodeNumber}(?:\\s*[-:.·|]\\s*|\\s+)`,
      'i'
    )
    const withoutExactPrefix = normalizedTitle.replace(exactPrefixRegex, '').trim()
    if (withoutExactPrefix) {
      normalizedTitle = withoutExactPrefix
    }
  }

  const withoutGenericPrefix = normalizedTitle
    .replace(/^(?:episode|ep\.?|e)\s*\d+(?:\s*[-:.·|]\s*|\s+)/i, '')
    .trim()

  if (withoutGenericPrefix) {
    return withoutGenericPrefix
  }

  return title
}

function buildCollapsedSynopsisText(synopsisText, maxLength = 220) {
  const text = cleanEnglishText(synopsisText, '')
  if (!text) return ''
  if (text.length <= maxLength) return text

  const sliced = text.slice(0, maxLength)
  const lastSpaceIndex = sliced.lastIndexOf(' ')
  const safeSlice =
    lastSpaceIndex > Math.floor(maxLength * 0.65) ? sliced.slice(0, lastSpaceIndex) : sliced

  return `${safeSlice.trimEnd()}...`
}

function getSynopsisPreviewState(synopsisText) {
  const fullText = cleanEnglishText(synopsisText, '')
  const collapsedText = buildCollapsedSynopsisText(fullText)
  const isLong = Boolean(fullText && collapsedText && collapsedText !== fullText)

  return {
    fullText,
    collapsedText,
    isLong
  }
}

async function getAnimeDetailSynopsis(animeId, fallbackSynopsis = '') {
  const fallbackText = cleanEnglishText(fallbackSynopsis, '')
  if (window.api?.db?.getAnimeById) {
    try {
      const detailedAnime = await window.api.db.getAnimeById(animeId)
      const dbSynopsis = cleanEnglishText(detailedAnime?.synopsis_en || detailedAnime?.synopsis || '', '')
      if (dbSynopsis) {
        return dbSynopsis
      }
    } catch {
      return fallbackText
    }
  }

  return fallbackText
}

function parseDateValue(value) {
  if (!value) return null

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value
  }

  const raw = String(value).trim()
  if (!raw) return null

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  if (Number.isFinite(parsed)) {
    return new Date(parsed)
  }

  const parsedUtc = Date.parse(`${normalized}Z`)
  if (Number.isFinite(parsedUtc)) {
    return new Date(parsedUtc)
  }

  return null
}

function formatRelativeUploadTime(value) {
  const dateValue = parseDateValue(value)
  if (!dateValue) return 'Just now'

  const diffMs = Date.now() - dateValue.getTime()
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Just now'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  const years = Math.floor(days / 365)
  return `${years}y ago`
}

function buildHomeAnimeEntry(value = {}) {
  const rank = Number(value.rank)
  const ratedBy = Number(value.rated_by)
  const englishTitle = cleanEnglishText(value.titre_en || value.titre_jp || value.animeTitle, '')
  const fallbackTitle = cleanDisplayText(value.titre_en || value.titre_jp || value.animeTitle, 'Untitled')

  return {
    id: value.id,
    rank: Number.isFinite(rank) && rank > 0 ? Math.trunc(rank) : null,
    rated_by: Number.isFinite(ratedBy) && ratedBy > 0 ? Math.trunc(ratedBy) : null,
    titre_en: englishTitle || fallbackTitle,
    titre_jp: cleanEnglishText(value.titre_jp || '', ''),
    poster_url: value.poster_url || '',
    note_imdb: value.note_imdb ? String(value.note_imdb) : '',
    synopsis_en: truncateText(value.synopsis_en || '', MAX_ANIME_SYNOPSIS_CHARS),
    format: cleanEnglishText(value.format || '', ''),
    statut: cleanEnglishText(value.statut || '', ''),
    total_episodes: value.total_episodes || null,
    year: value.year || '',
    genres: normalizeAnimeGenres(value.genres),
    sourceType: cleanDisplayText(value.sourceType || value.source_type || 'db', 'db'),
    sourceId: cleanDisplayText(value.sourceId || value.source_id || '', ''),
    scraperAnimeId: cleanDisplayText(value.scraperAnimeId || value.scraper_anime_id || '', '')
  }
}

function normalizeAnimeEntry(anime = {}) {
  const id = anime.id ?? anime.mal_id ?? anime.anime_id
  if (id === null || id === undefined) return null

  return buildHomeAnimeEntry({
    ...anime,
    id,
    rank: anime.rank,
    rated_by: anime.rated_by ?? anime.scored_by,
    titre_en: anime.titre_en || anime.title_english || anime.title || anime.titre_jp,
    titre_jp: anime.titre_jp || anime.title_japanese || '',
    poster_url: anime.poster_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
    note_imdb: anime.note_imdb ?? anime.score,
    synopsis_en: anime.synopsis_en || anime.synopsis,
    format: anime.format || anime.type,
    statut: anime.statut || anime.status,
    total_episodes: anime.total_episodes || anime.episodes,
    year: anime.year || anime.aired?.prop?.from?.year,
    genres: anime.genres,
    sourceType: anime.sourceType || anime.source_type,
    sourceId: anime.sourceId || anime.source_id,
    scraperAnimeId: anime.scraperAnimeId || anime.scraper_anime_id
  })
}

function normalizeAnimeCollection(animes = [], limit = Infinity) {
  return (animes || [])
    .map((anime) => normalizeAnimeEntry(anime))
    .filter(Boolean)
    .slice(0, limit)
}

function mapLatestEpisodeItem(rawEpisode, index = 0) {
  if (!rawEpisode) return null

  const animeId = rawEpisode.anime_id ?? rawEpisode.animeId ?? rawEpisode.anime?.id
  if (animeId === null || animeId === undefined) return null

  const episodeNumberRaw = Number(rawEpisode.numero ?? rawEpisode.episodeNumber)
  const episodeNumber =
    Number.isFinite(episodeNumberRaw) && episodeNumberRaw > 0
      ? Math.trunc(episodeNumberRaw)
      : index + 1

  const episodeTitleSource = cleanEnglishText(
    rawEpisode.episode_title || rawEpisode.episodeTitle || rawEpisode.titre_ar || rawEpisode.title,
    ''
  )

  const anime = buildHomeAnimeEntry({
    id: animeId,
    titre_en: rawEpisode.titre_en || rawEpisode.anime?.titre_en || rawEpisode.animeTitle,
    titre_jp: rawEpisode.titre_jp || rawEpisode.anime?.titre_jp,
    poster_url: rawEpisode.poster_url || rawEpisode.anime?.poster_url,
    note_imdb: rawEpisode.note_imdb || rawEpisode.anime?.note_imdb,
    synopsis_en: rawEpisode.synopsis_en || rawEpisode.anime?.synopsis_en,
    format: rawEpisode.format || rawEpisode.anime?.format,
    statut: rawEpisode.statut || rawEpisode.anime?.statut,
    total_episodes: rawEpisode.total_episodes || rawEpisode.anime?.total_episodes,
    year: rawEpisode.year || rawEpisode.anime?.year,
    genres: rawEpisode.genres || rawEpisode.anime?.genres || []
  })

  const uploadedAt =
    rawEpisode.uploaded_at || rawEpisode.uploadedAt || rawEpisode.date_sortie || rawEpisode.date_ajout || ''

  return {
    id: rawEpisode.episode_id ?? rawEpisode.episodeId ?? rawEpisode.id ?? `${animeId}-${episodeNumber}`,
    animeId,
    episodeNumber,
    episodeTitle: episodeTitleSource || `Episode ${episodeNumber}`,
    uploadedAt,
    uploadedAgo: formatRelativeUploadTime(uploadedAt),
    anime
  }
}

async function fetchLatestEpisodesFromDb(limit = HOME_LIMIT) {
  if (!window.api?.db?.getLatestEpisodes) return []

  try {
    const items = await window.api.db.getLatestEpisodes(limit)
    return Array.isArray(items) ? items : []
  } catch (err) {
    console.warn('Failed to fetch latest episodes from database:', err)
    return []
  }
}

function formatPlayerTime(value) {
  const totalSeconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function setRangeProgress(element, variableName, percentValue) {
  if (!element) return
  const clamped = Math.max(0, Math.min(100, Number(percentValue) || 0))
  element.style.setProperty(variableName, `${clamped}%`)
}

function setPlayerSettingsMenuOpen(isOpen) {
  if (!playerSettingsMenuEl || !playerSettingsToggleBtn) return

  playerSettingsMenuEl.classList.toggle('is-hidden', !isOpen)
  playerSettingsMenuEl.setAttribute('aria-hidden', String(!isOpen))
  playerSettingsToggleBtn.setAttribute('aria-expanded', String(isOpen))

  if (isOpen) {
    clearPlayerControlsIdleTimer()
    setPlayerControlsIdle(false)
    return
  }

  schedulePlayerControlsAutoHide()
}

function clearPlayerControlsIdleTimer() {
  if (!playerControlsIdleTimer) return
  clearTimeout(playerControlsIdleTimer)
  playerControlsIdleTimer = null
}

function setPlayerControlsIdle(isIdle) {
  if (!playerContainerEl || !playerControlsEl) return
  playerContainerEl.classList.toggle('player-controls-idle', Boolean(isIdle))
}

function schedulePlayerControlsAutoHide() {
  if (!playerContainerEl || !playerControlsEl || !videoPlayer) return

  clearPlayerControlsIdleTimer()
  setPlayerControlsIdle(false)

  const settingsOpen = playerSettingsMenuEl
    ? !playerSettingsMenuEl.classList.contains('is-hidden')
    : false

  if (videoPlayer.paused || !videoPlayer.src || settingsOpen) return

  playerControlsIdleTimer = setTimeout(() => {
    const menuOpen = playerSettingsMenuEl
      ? !playerSettingsMenuEl.classList.contains('is-hidden')
      : false

    if (!videoPlayer.paused && videoPlayer.src && !menuOpen) {
      setPlayerControlsIdle(true)
    }
  }, PLAYER_CONTROLS_IDLE_MS)
}

function getCurrentEpisode() {
  if (playerEpisodeIndex < 0 || playerEpisodeIndex >= playerEpisodeQueue.length) return null
  return playerEpisodeQueue[playerEpisodeIndex]
}

function getEpisodeSourceByQuality(episode, quality = 'auto') {
  if (!episode) return ''

  if (quality === 'auto' && episode.sources) {
    const autoQualityPreference = ['1080', '720', '480', '360', '240']
    const preferredQuality = autoQualityPreference.find((qualityKey) => episode.sources?.[qualityKey])
    if (preferredQuality) return episode.sources[preferredQuality]
  }

  if (episode.sources && episode.sources[quality]) return episode.sources[quality]
  if (episode.sources?.auto) return episode.sources.auto
  return episode.src || ''
}

function extractQualityFromTranscodeKey(transcodeKey) {
  if (!transcodeKey) return ''
  const match = String(transcodeKey).match(/(\d{3,4})p/)
  return match ? match[1] : ''
}

async function fetchCommonsEpisodeSources(commonsTitle, fallbackSrc = '') {
  if (!commonsTitle) {
    return fallbackSrc ? { auto: fallbackSrc } : {}
  }

  if (commonsEpisodeSourcesCache.has(commonsTitle)) {
    return commonsEpisodeSourcesCache.get(commonsTitle)
  }

  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    titles: commonsTitle,
    prop: 'videoinfo',
    viprop: 'url|derivatives'
  })

  const response = await fetch(`${COMMONS_API_URL}?${query.toString()}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Commons request failed (${response.status})`)
  }

  const payload = await response.json()
  const pages = payload?.query?.pages || {}
  const page = Object.values(pages)[0]
  const videoInfo = page?.videoinfo?.[0]

  if (!videoInfo?.url) {
    const fallbackSources = fallbackSrc ? { auto: fallbackSrc } : {}
    setCommonsEpisodeSourcesCache(commonsTitle, fallbackSources)
    return fallbackSources
  }

  const sources = {
    auto: videoInfo.url
  }

  ;(videoInfo.derivatives || []).forEach((derivative) => {
    const quality = extractQualityFromTranscodeKey(derivative?.transcodekey)
    if (!quality || !derivative?.src || sources[quality]) return
    sources[quality] = derivative.src
  })

  if (fallbackSrc && !sources.auto) {
    sources.auto = fallbackSrc
  }

  setCommonsEpisodeSourcesCache(commonsTitle, sources)
  return sources
}

async function hydrateEpisodeSources(episode) {
  if (!episode) return

  if (episode.sources?.auto && Object.keys(episode.sources).length > 1) {
    return
  }

  if (episode.sourceType === 'scraper' && window.api?.scraper?.resolveStream) {
    try {
      const payload = await window.api.scraper.resolveStream(
        episode.scraperEpisodeId || episode.id,
        episode.sourceId || SCRAPER_DEFAULT_SOURCE_ID
      )

      const sources = {}
      if (Array.isArray(payload?.streams)) {
        payload.streams.forEach((stream) => {
          const streamUrl = cleanDisplayText(stream?.url || '', '')
          if (!streamUrl) return

          const qualityKey = normalizeScraperQualityKey(stream?.quality || stream?.label || '')
          if (qualityKey && !sources[qualityKey]) {
            sources[qualityKey] = streamUrl
          }

          if (!sources.auto) {
            sources.auto = streamUrl
          }
        })
      }

      const fallbackStreamUrl = cleanDisplayText(payload?.streamUrl || '', '')
      if (!sources.auto && fallbackStreamUrl) {
        sources.auto = fallbackStreamUrl
      }

      if (Object.keys(sources).length) {
        episode.sources = sources
        episode.src = sources.auto || Object.values(sources)[0] || ''
      }
      return
    } catch (error) {
      console.warn('Failed to resolve scraper episode stream:', error)
    }
  }

  if (episode.commonsTitle) {
    try {
      episode.sources = await fetchCommonsEpisodeSources(episode.commonsTitle, episode.src || '')
      return
    } catch (error) {
      console.warn('Failed to resolve Commons episode sources:', error)
    }
  }

  if (!episode.sources?.auto && episode.src) {
    episode.sources = { auto: episode.src }
  }
}

function getEpisodeQualityEntries(episode) {
  if (!episode?.sources) return []

  return Object.keys(episode.sources)
    .filter((qualityKey) => qualityKey !== 'auto' && /^\d+$/.test(qualityKey))
    .sort((a, b) => Number(b) - Number(a))
}

function syncPlayerQualityOptions(episode) {
  if (!playerQualityEl) return

  const qualityEntries = getEpisodeQualityEntries(episode)
  const previousSelection = playerSelectedQuality

  playerQualityEl.innerHTML = ''

  const autoOption = document.createElement('option')
  autoOption.value = 'auto'
  autoOption.textContent = 'Auto'
  playerQualityEl.appendChild(autoOption)

  qualityEntries.forEach((qualityKey) => {
    const option = document.createElement('option')
    option.value = qualityKey
    option.textContent = `${qualityKey}p`
    playerQualityEl.appendChild(option)
  })

  const isPreviousAvailable =
    previousSelection === 'auto' || qualityEntries.includes(previousSelection)

  playerSelectedQuality = isPreviousAvailable ? previousSelection : 'auto'
  playerQualityEl.value = playerSelectedQuality
}

function setTemporaryButtonLabel(button, temporaryText, timeout = 1400) {
  if (!button) return

  const originalText = button.getAttribute('data-original-text') || button.textContent || ''
  button.setAttribute('data-original-text', originalText)
  button.textContent = temporaryText

  setTimeout(() => {
    button.textContent = originalText
  }, timeout)
}

function showPlayerShortcutHint(iconClass, text, options = {}) {
  if (!playerShortcutHintEl || !playerShortcutIconEl || !playerShortcutTextEl) return

  const size = options?.size === 'compact' ? 'compact' : 'large'

  playerShortcutIconEl.className = `${iconClass} player-shortcut-icon`
  playerShortcutTextEl.textContent = text
  playerShortcutHintEl.classList.toggle('is-compact', size === 'compact')
  playerShortcutHintEl.classList.remove('is-hidden')
  playerShortcutHintEl.setAttribute('aria-hidden', 'false')

  if (playerShortcutHintTimer) {
    clearTimeout(playerShortcutHintTimer)
  }

  playerShortcutHintTimer = setTimeout(() => {
    playerShortcutHintEl.classList.add('is-hidden')
    playerShortcutHintEl.setAttribute('aria-hidden', 'true')
  }, 1000)
}

function buildPlayerTimeHintText(timeValue) {
  const duration = Number.isFinite(videoPlayer?.duration) ? videoPlayer.duration : 0
  const safeTime = Number.isFinite(timeValue) ? Math.max(0, Number(timeValue)) : 0
  const clampedTime = duration > 0 ? Math.min(safeTime, duration) : safeTime

  if (duration > 0) {
    return `${formatPlayerTime(clampedTime)} / ${formatPlayerTime(duration)}`
  }

  return formatPlayerTime(clampedTime)
}

function showPlayerTimeHint(timeValue, prefix = '') {
  const timeText = buildPlayerTimeHintText(timeValue)
  const text = prefix ? `${prefix} · ${timeText}` : timeText
  showPlayerShortcutHint('fa-regular fa-clock', text, { size: 'compact' })
}

function getVolumeHintMeta() {
  if (!videoPlayer) {
    return {
      iconClass: 'fa-solid fa-volume-high',
      text: 'Volume 100%'
    }
  }

  const muted = videoPlayer.muted || videoPlayer.volume === 0
  const volumePercent = Math.round((videoPlayer.muted ? 0 : videoPlayer.volume) * 100)

  if (muted) {
    return {
      iconClass: 'fa-solid fa-volume-xmark',
      text: 'Muted'
    }
  }

  if (volumePercent <= 35) {
    return {
      iconClass: 'fa-solid fa-volume-low',
      text: `Volume ${volumePercent}%`
    }
  }

  return {
    iconClass: 'fa-solid fa-volume-high',
    text: `Volume ${volumePercent}%`
  }
}

function showSeekHoverTimeHint(event) {
  if (!playerSeekEl || !videoPlayer) return

  const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0
  if (duration <= 0) return

  const rect = playerSeekEl.getBoundingClientRect()
  if (rect.width <= 0) return

  const pointerX = Number(event.clientX)
  if (!Number.isFinite(pointerX)) return

  const ratio = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width))
  showPlayerTimeHint(duration * ratio)
}

function showSeekDeltaTimeHint(seconds) {
  if (!videoPlayer) return
  const roundedDelta = Math.round(seconds)
  const sign = roundedDelta > 0 ? '+' : ''
  showPlayerTimeHint(videoPlayer.currentTime, `${sign}${roundedDelta}s`)
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getEpisodeRatingState(episode) {
  const templateId = episode?.templateId || ''
  if (!templateId) return { sum: 0, votes: 0, mine: null }

  const seed = PLAYER_RATING_SEED[templateId] || { avg: 0, votes: 0 }
  const baseSum = seed.avg * seed.votes

  try {
    const rawStore = localStorage.getItem(PLAYER_RATING_STORAGE_KEY)
    if (!rawStore) {
      return { sum: baseSum, votes: seed.votes, mine: null }
    }

    const parsedStore = JSON.parse(rawStore)
    const mine = Number(parsedStore?.[templateId])
    if (!Number.isFinite(mine) || mine < 1 || mine > 10) {
      return { sum: baseSum, votes: seed.votes, mine: null }
    }

    return {
      sum: baseSum + mine,
      votes: seed.votes + 1,
      mine
    }
  } catch {
    return { sum: baseSum, votes: seed.votes, mine: null }
  }
}

function saveEpisodeRating(episode, rating) {
  const templateId = episode?.templateId || ''
  if (!templateId) return

  try {
    const rawStore = localStorage.getItem(PLAYER_RATING_STORAGE_KEY)
    const parsedStore = rawStore ? JSON.parse(rawStore) : {}
    parsedStore[templateId] = rating
    localStorage.setItem(PLAYER_RATING_STORAGE_KEY, JSON.stringify(parsedStore))
  } catch {
    // ignore localStorage failures
  }
}

function getStoredCommentsMap() {
  try {
    const rawStore = localStorage.getItem(PLAYER_COMMENTS_STORAGE_KEY)
    if (!rawStore) return {}
    const parsedStore = JSON.parse(rawStore)
    return parsedStore && typeof parsedStore === 'object' ? parsedStore : {}
  } catch {
    return {}
  }
}

function saveStoredCommentsMap(commentsMap) {
  try {
    localStorage.setItem(PLAYER_COMMENTS_STORAGE_KEY, JSON.stringify(commentsMap))
  } catch {
    // ignore localStorage failures
  }
}

function getStoredEpisodeComments(episode) {
  const threadId = episode?.templateId || ''
  if (!threadId) return []

  const commentsMap = getStoredCommentsMap()
  const threadComments = commentsMap[threadId]
  if (!Array.isArray(threadComments)) return []

  return threadComments
    .slice(-40)
    .map((comment) => ({
      user: cleanEnglishText(comment?.user, 'You'),
      text: cleanEnglishText(comment?.text, ''),
      time: cleanEnglishText(comment?.time, 'now')
    }))
    .filter((comment) => comment.text)
}

function appendStoredEpisodeComment(episode, text) {
  const threadId = episode?.templateId || ''
  const commentText = cleanEnglishText(text, '')
  if (!threadId || !commentText) return false

  const commentsMap = getStoredCommentsMap()
  const currentThread = Array.isArray(commentsMap[threadId]) ? commentsMap[threadId] : []
  const nextThread = [...currentThread, { user: 'You', text: commentText, time: 'Just now' }].slice(-40)
  commentsMap[threadId] = nextThread
  saveStoredCommentsMap(commentsMap)
  return true
}

function setEmojiPickerOpen(isOpen) {
  if (!playerEmojiPickerEl || !playerEmojiToggleBtn) return
  playerEmojiPickerEl.classList.toggle('is-hidden', !isOpen)
  playerEmojiPickerEl.setAttribute('aria-hidden', String(!isOpen))
  playerEmojiToggleBtn.setAttribute('aria-expanded', String(isOpen))
}

function setCommentComposerEnabled(enabled) {
  const isEnabled = Boolean(enabled)

  if (playerCommentInputEl) {
    playerCommentInputEl.disabled = !isEnabled
    if (!isEnabled) {
      playerCommentInputEl.value = ''
    }
  }

  if (playerCommentSendBtn) {
    playerCommentSendBtn.disabled = !isEnabled
  }

  if (playerEmojiToggleBtn) {
    playerEmojiToggleBtn.disabled = !isEnabled
  }

  if (!isEnabled) {
    setEmojiPickerOpen(false)
  }
}

function submitPlayerComment() {
  const episode = getCurrentEpisode()
  if (!episode || !playerCommentInputEl) return

  const text = cleanEnglishText(playerCommentInputEl.value, '')
  if (!text) return

  const saved = appendStoredEpisodeComment(episode, text)
  if (!saved) return

  playerCommentInputEl.value = ''
  renderPlayerComments(episode)
  setEmojiPickerOpen(false)
  showPlayerShortcutHint('fa-regular fa-comment', 'Comment posted')
}

function renderPlayerRatingPanel(episode) {
  const ratingState = getEpisodeRatingState(episode)
  const average = ratingState.votes > 0 ? ratingState.sum / ratingState.votes : 0

  if (playerYourRatingEl) {
    playerYourRatingEl.textContent = ratingState.mine
      ? `Your rating: ${ratingState.mine}/10`
      : 'Your rating: --/10'
  }

  if (playerAppRatingEl) {
    playerAppRatingEl.textContent =
      ratingState.votes > 0
        ? `App rating: ${average.toFixed(1)}/10 · ${ratingState.votes} ratings`
        : 'App rating: --/10'
  }

  playerRateButtons.forEach((button) => {
    const buttonRating = Number(button.dataset.rating)
    const isActive = Number.isFinite(buttonRating) && ratingState.mine === buttonRating
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
    button.disabled = !episode
  })
}

function buildPlayerComments(episode) {
  const sourceComments = Array.isArray(episode?.comments) ? episode.comments : []
  const storedComments = getStoredEpisodeComments(episode)
  const mergedComments = [...storedComments.reverse(), ...sourceComments]

  if (!mergedComments.length) {
    return []
  }

  return mergedComments.slice(0, 14).map((comment) => ({
    user: cleanEnglishText(comment.user, 'User'),
    text: cleanEnglishText(comment.text, ''),
    time: cleanEnglishText(comment.time, 'now')
  }))
}

function renderPlayerComments(episode) {
  if (!playerCommentsListEl || !playerCommentsCountEl) return

  const comments = buildPlayerComments(episode)
  playerCommentsCountEl.textContent = String(comments.length)

  if (!comments.length) {
    playerCommentsListEl.innerHTML = '<li class="player-comment-empty">No comments yet.</li>'
    return
  }

  playerCommentsListEl.innerHTML = comments
    .map(
      (comment) => `
        <li class="player-comment-item">
          <div class="player-comment-meta">
            <span class="player-comment-user">${escapeHtml(comment.user)}</span>
            <span class="player-comment-time">${escapeHtml(comment.time)}</span>
          </div>
          <p class="player-comment-text">${escapeHtml(comment.text)}</p>
        </li>
      `
    )
    .join('')
}

function updatePlayerMetaPanel(episode) {
  const animeTitle = cleanEnglishText(playerEpisodeAnime?.titre_en || playerEpisodeAnime?.titre_jp, 'Anime')
  const episodeTitle = cleanEnglishText(episode?.title || '', 'Episode')

  if (playerAnimeTitleEl) {
    playerAnimeTitleEl.textContent = animeTitle
  }

  if (playerEpisodeTitleEl) {
    playerEpisodeTitleEl.textContent = episodeTitle
  }

  setCommentComposerEnabled(Boolean(episode))
  renderPlayerRatingPanel(episode)
  renderPlayerComments(episode)
}

function isPlayerViewActive() {
  const playerView = document.getElementById('view-player')
  return Boolean(playerView && !playerView.classList.contains('hidden'))
}

function updateEpisodeNavState() {
  const hasPrev = playerEpisodeIndex > 0
  const hasNext = playerEpisodeIndex >= 0 && playerEpisodeIndex < playerEpisodeQueue.length - 1

  if (playerPrevEpisodeBtn) {
    playerPrevEpisodeBtn.disabled = !hasPrev
    playerPrevEpisodeBtn.setAttribute('aria-disabled', String(!hasPrev))
  }

  if (playerNextEpisodeBtn) {
    playerNextEpisodeBtn.disabled = !hasNext
    playerNextEpisodeBtn.setAttribute('aria-disabled', String(!hasNext))
  }
}

function normalizeServerQualityKey(server = {}) {
  const qualityLabel = cleanEnglishText(server.qualite || '', '').toLowerCase()
  const numericMatch = qualityLabel.match(/(\d{3,4})/)
  if (numericMatch) return numericMatch[1]
  return qualityLabel.includes('auto') ? 'auto' : ''
}

function normalizeScraperQualityKey(value) {
  const qualityLabel = cleanDisplayText(value || '', '').toLowerCase()
  const numericMatch = qualityLabel.match(/(\d{3,4})/)
  if (numericMatch) return numericMatch[1]
  return ''
}

function mapDbEpisodesToQueue(animeId, episodes = []) {
  return (episodes || [])
    .map((episode, index) => {
      const orderRaw = Number(episode?.numero)
      const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : index + 1
      const title = cleanEnglishText(episode?.titre_ar || episode?.title || '', `Episode ${order}`)
      const servers = Array.isArray(episode?.serveurs) ? episode.serveurs : []

      const sources = {}
      for (const server of servers) {
        const url = cleanEnglishText(server?.url_video || '', '')
        if (!url) continue

        const qualityKey = normalizeServerQualityKey(server)
        if (qualityKey && !sources[qualityKey]) {
          sources[qualityKey] = url
        }

        if (!sources.auto) {
          sources.auto = url
        }
      }

      const sourceUrl = sources.auto || cleanEnglishText(episode?.src || '', '')
      if (!sourceUrl) return null

      return {
        id: `${animeId}-${episode?.id || order}`,
        templateId: `episode-${episode?.id || order}`,
        order,
        title,
        displayTitle: `Episode ${order} · ${title}`,
        src: sourceUrl,
        sources,
        comments: []
      }
    })
    .filter(Boolean)
}

function mapScraperEpisodesToQueue(anime, episodes = []) {
  const animeId = anime?.id
  const sourceId = anime?.sourceId || SCRAPER_DEFAULT_SOURCE_ID

  return (episodes || [])
    .map((episode, index) => {
      const orderRaw = Number(episode?.number)
      const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : index + 1
      const rawTitle = cleanDisplayText(episode?.title, '')
      const title = cleanEnglishText(rawTitle, rawTitle || `Episode ${order}`)
      const episodeId = cleanDisplayText(episode?.episodeId || episode?.id, '')

      if (!episodeId) return null

      return {
        id: `${animeId}-${episodeId}`,
        scraperEpisodeId: episodeId,
        sourceType: 'scraper',
        sourceId,
        templateId: `scraper-${sourceId}-${animeId}-${order}`,
        order,
        title,
        displayTitle: `Episode ${order} · ${title}`,
        src: '',
        sources: {},
        comments: []
      }
    })
    .filter(Boolean)
}

async function ensureEpisodeQueueForAnime(anime) {
  const animeId = anime?.id
  if (animeId === null || animeId === undefined) return []

  const cacheKey = String(animeId)
  if (episodeQueueCache.has(cacheKey)) {
    return episodeQueueCache.get(cacheKey) || []
  }

  if (!window.api?.db?.getEpisodes) {
    if (anime?.sourceType !== 'scraper') {
      episodeQueueCache.set(cacheKey, [])
      return []
    }
  }

  if (anime?.sourceType === 'scraper' && window.api?.scraper?.getEpisodes) {
    try {
      const payload = await window.api.scraper.getEpisodes(
        anime.scraperAnimeId || anime.id,
        anime.sourceId || SCRAPER_DEFAULT_SOURCE_ID
      )
      const episodes = Array.isArray(payload?.episodes) ? payload.episodes : []
      const queue = mapScraperEpisodesToQueue(anime, episodes)
      episodeQueueCache.set(cacheKey, queue)
      return queue
    } catch (error) {
      console.warn('Failed to load episodes from scraper source:', error)
      episodeQueueCache.set(cacheKey, [])
      return []
    }
  }

  try {
    const episodes = await window.api.db.getEpisodes(animeId)
    const queue = mapDbEpisodesToQueue(animeId, episodes)
    episodeQueueCache.set(cacheKey, queue)
    return queue
  } catch (error) {
    console.warn('Failed to load episodes from database:', error)
    episodeQueueCache.set(cacheKey, [])
    return []
  }
}

function applySelectedQualityToCurrentEpisode() {
  if (!videoPlayer) return

  const episode = getCurrentEpisode()
  if (!episode) return

  const source = getEpisodeSourceByQuality(episode, playerSelectedQuality)
  if (!source) return

  const currentSrc = videoPlayer.currentSrc || videoPlayer.src
  if (currentSrc === source) return

  const wasPaused = videoPlayer.paused
  const currentTime = Number.isFinite(videoPlayer.currentTime) ? videoPlayer.currentTime : 0
  const playbackRate = videoPlayer.playbackRate

  videoPlayer.src = source
  videoPlayer.load()

  videoPlayer.addEventListener(
    'loadedmetadata',
    () => {
      if (Number.isFinite(currentTime) && currentTime > 0) {
        const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : currentTime
        videoPlayer.currentTime = Math.min(currentTime, duration)
      }

      videoPlayer.playbackRate = playbackRate
      if (!wasPaused) {
        videoPlayer.play().catch(() => {})
      }

      updatePlayerTimeline()
    },
    { once: true }
  )
}

async function ensureWindowMaximized() {
  if (!window.api?.window) return

  try {
    const isMaximized = await window.api.window.isMaximized()
    if (!isMaximized) {
      window.api.window.maximizeToggle()
    }
  } catch (error) {
    console.debug('Window maximize sync failed:', error)
  }
}

async function togglePlayerFullscreen() {
  if (!playerContainerEl) return

  try {
    if (document.fullscreenElement === playerContainerEl) {
      await document.exitFullscreen()
      return
    }

    await ensureWindowMaximized()
    await playerContainerEl.requestFullscreen()
  } catch (error) {
    console.debug('Fullscreen toggle failed:', error)
  }
}

async function togglePlayerPip() {
  if (!videoPlayer) return
  if (!('pictureInPictureEnabled' in document) || videoPlayer.disablePictureInPicture) return

  try {
    if (document.pictureInPictureElement === videoPlayer) {
      await document.exitPictureInPicture()
    } else {
      await videoPlayer.requestPictureInPicture()
    }
  } catch (error) {
    console.debug('Picture-in-picture toggle failed:', error)
  }
}

function stopPlayerPlayback() {
  if (!videoPlayer) return

  if (document.pictureInPictureElement === videoPlayer) {
    document.exitPictureInPicture().catch(() => {})
  }

  if (document.fullscreenElement === playerContainerEl) {
    document.exitFullscreen().catch(() => {})
  }

  videoPlayer.pause()
  videoPlayer.removeAttribute('src')
  videoPlayer.querySelectorAll('track').forEach((track) => track.remove())
  videoPlayer.load()
  resetPlayerUiState()
}

function seekPlayerBy(seconds) {
  if (!videoPlayer || !videoPlayer.src) return
  const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0
  const nextTime = Math.max(0, videoPlayer.currentTime + seconds)
  videoPlayer.currentTime = duration > 0 ? Math.min(duration, nextTime) : nextTime
}

function setPlayerVolumeBy(delta) {
  if (!videoPlayer) return
  const current = videoPlayer.muted ? 0 : videoPlayer.volume
  const volume = Math.max(0, Math.min(1, current + delta))
  videoPlayer.muted = false
  videoPlayer.volume = volume
  if (volume === 0) {
    videoPlayer.muted = true
  }
  updatePlayerMuteState()
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function updatePlayerTimeline() {
  if (!videoPlayer) return

  const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0
  const currentTime = Number.isFinite(videoPlayer.currentTime) ? videoPlayer.currentTime : 0

  if (playerSeekEl) {
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0
    playerSeekEl.value = String(progress)
    setRangeProgress(playerSeekEl, '--seek-progress', progress)
  }

  if (playerTimeEl) {
    playerTimeEl.textContent = `${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`
  }
}

function updatePlayerPlayState() {
  if (!videoPlayer || !playerToggleBtn) return
  const icon = videoPlayer.paused ? 'fa-play' : 'fa-pause'
  const label = videoPlayer.paused ? 'Play' : 'Pause'
  playerToggleBtn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`
  playerToggleBtn.setAttribute('aria-label', label)

  if (videoPlayer.paused) {
    clearPlayerControlsIdleTimer()
    setPlayerControlsIdle(false)
  } else {
    schedulePlayerControlsAutoHide()
  }
}

function updatePlayerMuteState() {
  if (!videoPlayer) return
  const muted = videoPlayer.muted || videoPlayer.volume === 0

  if (playerMuteBtn) {
    const icon = muted ? 'fa-volume-xmark' : 'fa-volume-high'
    const label = muted ? 'Unmute' : 'Mute'
    playerMuteBtn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`
    playerMuteBtn.setAttribute('aria-label', label)
  }

  if (playerVolumeEl) {
    const volumeValue = videoPlayer.muted ? 0 : videoPlayer.volume
    playerVolumeEl.value = String(volumeValue)
    setRangeProgress(playerVolumeEl, '--volume-progress', volumeValue * 100)
  }
}

function updatePlayerFullscreenState() {
  if (!playerFullscreenBtn || !playerContainerEl) return
  const isFullscreen = document.fullscreenElement === playerContainerEl
  playerFullscreenBtn.innerHTML = `<i class="fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}" aria-hidden="true"></i>`
  playerFullscreenBtn.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Fullscreen')
}

function resetPlayerUiState() {
  playerSelectedQuality = 'auto'

  if (playerQualityEl) {
    playerQualityEl.value = playerSelectedQuality
  }

  if (playerSpeedEl) {
    playerSpeedEl.value = '1'
  }

  if (videoPlayer) {
    videoPlayer.playbackRate = 1
    videoPlayer.muted = false
    videoPlayer.volume = 1
  }

  updatePlayerTimeline()
  updatePlayerPlayState()
  updatePlayerMuteState()
  updatePlayerFullscreenState()
  updateEpisodeNavState()
  setPlayerSettingsMenuOpen(false)
  clearPlayerControlsIdleTimer()
  setPlayerControlsIdle(false)
  updatePlayerMetaPanel(null)
}

async function playEpisodeByIndex(index, options = {}) {
  if (!videoPlayer) return
  if (index < 0 || index >= playerEpisodeQueue.length) return

  const autoplay = options.autoplay ?? true
  playerEpisodeIndex = index

  const episode = playerEpisodeQueue[index]
  updatePlayerMetaPanel(episode)
  await hydrateEpisodeSources(episode)
  syncPlayerQualityOptions(episode)
  const source =
    getEpisodeSourceByQuality(episode, playerSelectedQuality) ||
    getEpisodeSourceByQuality(episode, 'auto')
  if (!source) {
    showPlayerShortcutHint('fa-solid fa-circle-exclamation', 'No playable stream', { size: 'compact' })
    return
  }
  const animeTitle = cleanEnglishText(playerEpisodeAnime?.titre_en || playerEpisodeAnime?.titre_jp, 'Anime')

  void hydrateEpisodeSources(episode).then(() => {
    const currentEpisode = getCurrentEpisode()
    if (!currentEpisode || currentEpisode.id !== episode.id) return

    syncPlayerQualityOptions(episode)

    const preferredSource = getEpisodeSourceByQuality(episode, playerSelectedQuality)
    const currentSource = videoPlayer.currentSrc || videoPlayer.src
    if (preferredSource && playerSelectedQuality !== 'auto' && preferredSource !== currentSource) {
      applySelectedQualityToCurrentEpisode()
    }
  })

  showView('player')
  setPlayerSettingsMenuOpen(false)
  videoPlayer.pause()
  videoPlayer.src = source
  videoPlayer.muted = false
  if (videoPlayer.volume <= 0) {
    videoPlayer.volume = 1
  }
  videoPlayer.currentTime = 0
  videoPlayer.playbackRate = Number(playerSpeedEl?.value || '1')
  videoPlayer.load()

  if (autoplay) {
    videoPlayer.play().catch(() => {})
  }

  updatePlayerTimeline()
  updatePlayerPlayState()
  updatePlayerMuteState()
  updateEpisodeNavState()
  document.title = `${animeTitle} - ${episode.title}`
}

function handlePlayerKeyboardShortcuts(event) {
  if (!isPlayerViewActive()) return
  if (isEditableTarget(event.target)) return

  const key = event.key
  const lowerKey = key.toLowerCase()
  const hasDuration = Number.isFinite(videoPlayer?.duration) && videoPlayer.duration > 0
  let handled = false

  if (event.shiftKey && lowerKey === 'n') {
    playEpisodeByIndex(playerEpisodeIndex + 1)
    showPlayerShortcutHint('fa-solid fa-forward-step', 'Next Episode')
    handled = true
  } else if (event.shiftKey && lowerKey === 'p') {
    playEpisodeByIndex(playerEpisodeIndex - 1)
    showPlayerShortcutHint('fa-solid fa-backward-step', 'Previous Episode')
    handled = true
  } else if (key === '>' || (event.shiftKey && key === '.')) {
    if (playerSpeedEl) {
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
      const current = Number(playerSpeedEl.value)
      const next = speeds.find((speed) => speed > current)
      if (next) {
        playerSpeedEl.value = String(next)
        videoPlayer.playbackRate = next
        showPlayerShortcutHint('fa-solid fa-gauge-high', `Speed ${next}x`)
      }
    }
    handled = true
  } else if (key === '<' || (event.shiftKey && key === ',')) {
    if (playerSpeedEl) {
      const speeds = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.5, 0.25]
      const current = Number(playerSpeedEl.value)
      const next = speeds.find((speed) => speed < current)
      if (next) {
        playerSpeedEl.value = String(next)
        videoPlayer.playbackRate = next
        showPlayerShortcutHint('fa-solid fa-gauge', `Speed ${next}x`)
      }
    }
    handled = true
  } else if (lowerKey === 'k' || key === ' ') {
    if (playerToggleBtn) {
      playerToggleBtn.click()
    } else if (videoPlayer?.src) {
      if (videoPlayer.paused) {
        videoPlayer.play().catch(() => {})
      } else {
        videoPlayer.pause()
      }

      const paused = Boolean(videoPlayer.paused)
      showPlayerShortcutHint(paused ? 'fa-solid fa-play' : 'fa-solid fa-pause', paused ? 'Play' : 'Pause')
    }
    handled = true
  } else if (lowerKey === 'j') {
    seekPlayerBy(-5)
    showSeekDeltaTimeHint(-5)
    handled = true
  } else if (lowerKey === 'l') {
    seekPlayerBy(5)
    showSeekDeltaTimeHint(5)
    handled = true
  } else if (key === 'ArrowLeft') {
    seekPlayerBy(-5)
    showSeekDeltaTimeHint(-5)
    handled = true
  } else if (key === 'ArrowRight') {
    seekPlayerBy(5)
    showSeekDeltaTimeHint(5)
    handled = true
  } else if (key === 'ArrowUp') {
    setPlayerVolumeBy(0.05)
    showPlayerShortcutHint('fa-solid fa-volume-high', 'Volume Up')
    handled = true
  } else if (key === 'ArrowDown') {
    setPlayerVolumeBy(-0.05)
    showPlayerShortcutHint('fa-solid fa-volume-low', 'Volume Down')
    handled = true
  } else if (lowerKey === 'm') {
    if (videoPlayer) {
      videoPlayer.muted = !videoPlayer.muted
      updatePlayerMuteState()
      showPlayerShortcutHint(
        videoPlayer.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high',
        videoPlayer.muted ? 'Muted' : 'Unmuted'
      )
    }
    handled = true
  } else if (lowerKey === 'f') {
    void togglePlayerFullscreen()
    showPlayerShortcutHint('fa-solid fa-expand', 'Fullscreen')
    handled = true
  } else if (lowerKey === 'i') {
    void togglePlayerPip()
    showPlayerShortcutHint('fa-regular fa-clone', 'Picture in Picture')
    handled = true
  } else if (lowerKey === 'n' && !event.shiftKey) {
    playEpisodeByIndex(playerEpisodeIndex + 1)
    showPlayerShortcutHint('fa-solid fa-forward-step', 'Next Episode')
    handled = true
  } else if (lowerKey === 'p' && !event.shiftKey) {
    playEpisodeByIndex(playerEpisodeIndex - 1)
    showPlayerShortcutHint('fa-solid fa-backward-step', 'Previous Episode')
    handled = true
  } else if (key === 'Escape') {
    setPlayerSettingsMenuOpen(false)
  } else if (key === 'Home') {
    if (videoPlayer) videoPlayer.currentTime = 0
    showPlayerShortcutHint('fa-solid fa-house', 'Start')
    handled = true
  } else if (key === 'End') {
    if (videoPlayer && hasDuration) videoPlayer.currentTime = videoPlayer.duration
    showPlayerShortcutHint('fa-solid fa-flag-checkered', 'End')
    handled = true
  } else if (lowerKey === ',' && videoPlayer?.paused) {
    seekPlayerBy(-1 / 30)
    showPlayerShortcutHint('fa-solid fa-backward', 'Frame -')
    handled = true
  } else if (lowerKey === '.' && videoPlayer?.paused) {
    seekPlayerBy(1 / 30)
    showPlayerShortcutHint('fa-solid fa-forward', 'Frame +')
    handled = true
  } else if (/^[0-9]$/.test(key) && videoPlayer && hasDuration) {
    const ratio = Number(key) / 10
    videoPlayer.currentTime = videoPlayer.duration * ratio
    showPlayerShortcutHint('fa-solid fa-bars-progress', `${key}0%`)
    handled = true
  }

  if (handled) {
    event.preventDefault()
  }
}

function setupCustomPlayer() {
  if (!videoPlayer) return

  const wakePlayerControls = () => {
    schedulePlayerControlsAutoHide()
  }

  playerContainerEl?.addEventListener('mousemove', wakePlayerControls, { passive: true })
  playerContainerEl?.addEventListener('pointermove', wakePlayerControls, { passive: true })
  playerContainerEl?.addEventListener('mouseenter', wakePlayerControls, { passive: true })
  playerContainerEl?.addEventListener('touchstart', wakePlayerControls, { passive: true })
  playerContainerEl?.addEventListener('click', wakePlayerControls)
  playerContainerEl?.addEventListener('mouseleave', () => {
    const menuOpen = playerSettingsMenuEl
      ? !playerSettingsMenuEl.classList.contains('is-hidden')
      : false

    if (!videoPlayer.paused && videoPlayer.src && !menuOpen) {
      setPlayerControlsIdle(true)
      clearPlayerControlsIdleTimer()
    }
  })

  const togglePlay = ({ showHint = false } = {}) => {
    if (!videoPlayer.src) return

    if (videoPlayer.paused) {
      videoPlayer.play().catch(() => {})
    } else {
      videoPlayer.pause()
    }

    if (showHint) {
      const paused = Boolean(videoPlayer.paused)
      showPlayerShortcutHint(paused ? 'fa-solid fa-play' : 'fa-solid fa-pause', paused ? 'Play' : 'Pause')
    }
  }

  playerToggleBtn?.addEventListener('click', () => {
    togglePlay({ showHint: true })
  })
  videoPlayer.addEventListener('click', () => {
    togglePlay({ showHint: true })
  })

  playerPrevEpisodeBtn?.addEventListener('click', () => {
    playEpisodeByIndex(playerEpisodeIndex - 1)
    showPlayerShortcutHint('fa-solid fa-backward-step', 'Previous Episode')
  })

  playerNextEpisodeBtn?.addEventListener('click', () => {
    playEpisodeByIndex(playerEpisodeIndex + 1)
    showPlayerShortcutHint('fa-solid fa-forward-step', 'Next Episode')
  })

  playerRewindBtn?.addEventListener('click', () => {
    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5)
    showSeekDeltaTimeHint(-5)
  })

  playerForwardBtn?.addEventListener('click', () => {
    const duration = Number.isFinite(videoPlayer.duration)
      ? videoPlayer.duration
      : videoPlayer.currentTime + 5
    videoPlayer.currentTime = Math.min(duration, videoPlayer.currentTime + 5)
    showSeekDeltaTimeHint(5)
  })

  playerSeekEl?.addEventListener('input', () => {
    const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0
    if (duration <= 0) return
    const progress = Number(playerSeekEl.value)
    setRangeProgress(playerSeekEl, '--seek-progress', progress)
    videoPlayer.currentTime = (progress / 100) * duration
    showPlayerTimeHint(videoPlayer.currentTime)
  })

  playerSeekEl?.addEventListener('mouseenter', showSeekHoverTimeHint)
  playerSeekEl?.addEventListener('mousemove', showSeekHoverTimeHint)

  playerRateButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const rating = Number(button.dataset.rating)
      const episode = getCurrentEpisode()
      if (!episode || !Number.isFinite(rating) || rating < 1 || rating > 10) return

      saveEpisodeRating(episode, rating)
      renderPlayerRatingPanel(episode)
      showPlayerShortcutHint('fa-solid fa-star', `Rated ${rating}/10`)
    })
  })

  playerEmojiToggleBtn?.addEventListener('click', (event) => {
    event.stopPropagation()
    const episode = getCurrentEpisode()
    if (!episode) return

    const shouldOpen = playerEmojiPickerEl
      ? playerEmojiPickerEl.classList.contains('is-hidden')
      : false
    setEmojiPickerOpen(shouldOpen)
  })

  playerEmojiPickerEl?.addEventListener('click', (event) => {
    event.stopPropagation()
  })

  playerEmojiButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const emoji = button.dataset.emoji || ''
      if (!emoji || !playerCommentInputEl || playerCommentInputEl.disabled) return

      playerCommentInputEl.value = `${playerCommentInputEl.value}${emoji}`.slice(0, 280)
      playerCommentInputEl.focus()
    })
  })

  playerCommentSendBtn?.addEventListener('click', () => {
    submitPlayerComment()
  })

  playerCommentInputEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    submitPlayerComment()
  })

  playerMuteBtn?.addEventListener('click', () => {
    videoPlayer.muted = !videoPlayer.muted
    updatePlayerMuteState()
    const volumeHint = getVolumeHintMeta()
    showPlayerShortcutHint(volumeHint.iconClass, volumeHint.text)
  })

  playerVolumeEl?.addEventListener('input', () => {
    const volume = Math.min(1, Math.max(0, Number(playerVolumeEl.value)))
    videoPlayer.volume = volume
    videoPlayer.muted = volume === 0
    setRangeProgress(playerVolumeEl, '--volume-progress', volume * 100)
    updatePlayerMuteState()
    const volumeHint = getVolumeHintMeta()
    showPlayerShortcutHint(volumeHint.iconClass, volumeHint.text)
  })

  playerSpeedEl?.addEventListener('change', () => {
    const speed = Number(playerSpeedEl.value)
    videoPlayer.playbackRate = Number.isFinite(speed) && speed > 0 ? speed : 1
    showPlayerShortcutHint('fa-solid fa-gauge-high', `Speed ${videoPlayer.playbackRate}x`)
  })

  playerQualityEl?.addEventListener('change', () => {
    playerSelectedQuality = playerQualityEl.value || 'auto'
    applySelectedQualityToCurrentEpisode()
    const qualityLabel = playerSelectedQuality === 'auto' ? 'Auto' : `${playerSelectedQuality}p`
    showPlayerShortcutHint('fa-solid fa-display', `Quality ${qualityLabel}`)
  })

  playerSettingsToggleBtn?.addEventListener('click', (event) => {
    event.stopPropagation()
    const shouldOpen = playerSettingsMenuEl
      ? playerSettingsMenuEl.classList.contains('is-hidden')
      : false
    setPlayerSettingsMenuOpen(shouldOpen)
  })

  playerSettingsMenuEl?.addEventListener('click', (event) => {
    event.stopPropagation()
  })

  document.addEventListener('click', () => {
    setPlayerSettingsMenuOpen(false)
    setEmojiPickerOpen(false)
  })

  playerCopyStreamBtn?.addEventListener('click', async () => {
    const streamUrl = videoPlayer.currentSrc || getEpisodeSourceByQuality(getCurrentEpisode(), playerSelectedQuality)
    if (!streamUrl) return

    const copied = await copyTextToClipboard(streamUrl)
    if (copied) {
      setTemporaryButtonLabel(playerCopyStreamBtn, 'Copied')
    }
  })

  playerCopyEpisodeBtn?.addEventListener('click', async () => {
    const episode = getCurrentEpisode()
    if (!episode) return

    const animeTitle = cleanEnglishText(playerEpisodeAnime?.titre_en || playerEpisodeAnime?.titre_jp, 'Anime')
    const copied = await copyTextToClipboard(`${animeTitle} - ${episode.title}`)
    if (copied) {
      setTemporaryButtonLabel(playerCopyEpisodeBtn, 'Copied')
    }
  })

  playerCopyTimeBtn?.addEventListener('click', async () => {
    const episode = getCurrentEpisode()
    const streamUrl = videoPlayer.currentSrc || getEpisodeSourceByQuality(episode, playerSelectedQuality)
    if (!streamUrl) return

    const currentSecond = Math.floor(Number.isFinite(videoPlayer.currentTime) ? videoPlayer.currentTime : 0)
    const copied = await copyTextToClipboard(`${streamUrl}#t=${currentSecond}`)
    if (copied) {
      setTemporaryButtonLabel(playerCopyTimeBtn, 'Copied')
    }
  })

  playerFullscreenBtn?.addEventListener('click', async () => {
    await togglePlayerFullscreen()
    const isFullscreen = document.fullscreenElement === playerContainerEl
    showPlayerShortcutHint(
      isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand',
      isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'
    )
  })

  playerPipBtn?.addEventListener('click', async () => {
    await togglePlayerPip()
    const inPip = document.pictureInPictureElement === videoPlayer
    showPlayerShortcutHint(
      inPip ? 'fa-regular fa-clone' : 'fa-regular fa-clone',
      inPip ? 'Picture in Picture On' : 'Picture in Picture Off'
    )
  })

  if (!('pictureInPictureEnabled' in document)) {
    playerPipBtn?.classList.add('is-hidden')
  }

  const timelineEvents = [
    'timeupdate',
    'loadedmetadata',
    'durationchange',
    'seeking',
    'seeked',
    'emptied'
  ]
  timelineEvents.forEach((eventName) => {
    videoPlayer.addEventListener(eventName, updatePlayerTimeline)
  })

  const playStateEvents = ['play', 'pause', 'ended', 'emptied']
  playStateEvents.forEach((eventName) => {
    videoPlayer.addEventListener(eventName, updatePlayerPlayState)
  })

  const volumeEvents = ['volumechange', 'loadedmetadata', 'emptied']
  volumeEvents.forEach((eventName) => {
    videoPlayer.addEventListener(eventName, updatePlayerMuteState)
  })

  document.addEventListener('fullscreenchange', updatePlayerFullscreenState)
  document.addEventListener('keydown', handlePlayerKeyboardShortcuts)

  resetPlayerUiState()
}

async function copyTextToClipboard(text) {
  if (!text) return false

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      return copied
    } catch {
      return false
    }
  }
}

function findAnimeById(animeId) {
  const targetId = String(animeId)

  for (const anime of searchCurrentResultsAnimes) {
    if (String(anime?.id) === targetId) return anime
  }

  for (const anime of searchRecommendedAnimes) {
    if (String(anime?.id) === targetId) return anime
  }

  for (const anime of topRatedAnimes) {
    if (String(anime?.id) === targetId) return anime
  }

  for (const episode of homeLatestEpisodes) {
    const anime = episode?.anime
    if (anime && String(anime.id) === targetId) return anime
  }

  return null
}

function setupWindowControls() {
  if (!window.api?.window) return

  const updateMaximizeButton = (isMaximized) => {
    if (!maximizeBtn) return
    maximizeBtn.textContent = isMaximized ? '◻' : '🗗'
    document.body.classList.toggle('window-maximized', Boolean(isMaximized))
  }

  minimizeBtn?.addEventListener('click', () => window.api.window.minimize())
  maximizeBtn?.addEventListener('click', () => window.api.window.maximizeToggle())
  closeBtn?.addEventListener('click', () => window.api.window.close())

  window.api.window
    .isMaximized()
    .then(updateMaximizeButton)
    .catch(() => {})
  window.api.window.onMaximizedChange(updateMaximizeButton)
}

function showView(viewId) {
  closeHomeEpisodeActionBoxes()

  const wasPlayerViewActive = isPlayerViewActive()
  const isSwitchingAwayFromPlayer = wasPlayerViewActive && viewId !== 'player'

  if (isSwitchingAwayFromPlayer) {
    stopPlayerPlayback()
  }

  document.querySelectorAll('.view').forEach((view) => view.classList.add('hidden'))
  document.querySelectorAll('.activity-item').forEach((button) => button.classList.remove('active'))

  const view = document.getElementById(`view-${viewId}`)
  if (view) {
    view.classList.remove('hidden')
  } else {
    document.getElementById('view-library')?.classList.remove('hidden')
    viewId = 'library'
  }

  document.querySelector(`.activity-item[data-view="${viewId}"]`)?.classList.add('active')

  if (viewId !== 'search') {
    clearSearchDbPoolCache()
  }
}

async function applyPlatformPerformanceMode() {
  if (!window.api?.system?.getPlatform) return

  try {
    const platform = await window.api.system.getPlatform()
    document.body.classList.toggle('platform-windows', platform === 'win32')
  } catch {
    document.body.classList.remove('platform-windows')
  }
}

function getAnimeScoreValue(anime) {
  const score = Number(anime?.note_imdb)
  return Number.isFinite(score) ? score : -1
}

async function loadTopRatedCatalogFromDb(limit = TOP_RATED_LIMIT) {
  let rows = []

  if (window.api?.db?.getAnimesLite) {
    try {
      rows = await window.api.db.getAnimesLite('', limit)
    } catch (error) {
      console.warn('Failed to load top-rated catalog from lightweight DB query:', error)
    }
  } else if (window.api?.db?.getAnimes) {
    try {
      rows = await window.api.db.getAnimes('')
    } catch (error) {
      console.warn('Failed to load top-rated catalog from DB:', error)
    }
  }

  const normalized = normalizeAnimeCollection(rows)
  const sorted = [...normalized].sort((animeA, animeB) => {
    const scoreDiff = getAnimeScoreValue(animeB) - getAnimeScoreValue(animeA)
    if (scoreDiff !== 0) return scoreDiff
    return String(animeA?.titre_en || animeA?.titre_jp || '').localeCompare(
      String(animeB?.titre_en || animeB?.titre_jp || '')
    )
  })

  return sorted.slice(0, limit).map((anime, index) => ({
    ...anime,
    rank: index + 1
  }))
}

function renderAnimeGrid({
  gridEl,
  animes,
  emptyMessage = 'No anime found.',
  sourceView = 'library',
  append = false,
  disableEntryAnimation = false
}) {
  if (!gridEl) return

  if (!append) {
    gridEl.innerHTML = ''
  }

  if (!animes || animes.length === 0) {
    if (!append) {
      gridEl.innerHTML = `<p class="empty-msg">${emptyMessage}</p>`
    }
    return
  }

  const fragment = document.createDocumentFragment()

  animes.forEach((anime) => {
    const card = document.createElement('div')
    card.className = 'anime-card'
    if (disableEntryAnimation) {
      card.classList.add('no-entry-animation')
    }

    const title = cleanDisplayText(anime.titre_en || anime.titre_jp, 'Untitled')
    const poster = getAnimePosterUrl(anime)

    card.innerHTML = `
      <img loading="lazy" decoding="async" src="${poster}" alt="${escapeHtml(title)}" onerror="this.onerror=null;this.src='${DEFAULT_POSTER_PLACEHOLDER}'">
      <div class="card-info">
        <p class="card-title">${escapeHtml(title)}</p>
        ${anime.note_imdb ? `<span class="card-score">⭐ ${anime.note_imdb}</span>` : ''}
      </div>
    `

    card.addEventListener('click', () => openAnimeDetail(anime.id, sourceView))
    fragment.appendChild(card)
  })

  gridEl.appendChild(fragment)
}

function setSearchRecommendedLabel(text) {
  if (!searchRecommendedLabelEl) return
  searchRecommendedLabelEl.classList.remove('is-loading')
  searchRecommendedLabelEl.textContent = text
}

function setSearchRecommendedLoading() {
  if (!searchRecommendedLabelEl) return
  searchRecommendedLabelEl.classList.add('is-loading')
  searchRecommendedLabelEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>'
  searchRecommendedLabelEl.setAttribute('aria-label', 'Loading')

  if (searchRecommendedGridEl) {
    searchRecommendedGridEl.innerHTML = getGridLoadingMarkup()
  }
}

function getGridLoadingMarkup() {
  return `
    <div class="grid-loading" aria-live="polite" aria-label="Loading">
      <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
    </div>
  `
}

function uniqueAnimeById(animes = []) {
  return Array.from(
    new Map(
      (animes || [])
        .filter((anime) => anime?.id !== undefined && anime?.id !== null)
        .map((anime) => [String(anime.id), anime])
    ).values()
  )
}

function getAnimeSearchBlob(anime) {
  const genres = Array.isArray(anime?.genres) ? anime.genres.join(' ') : ''
  return cleanEnglishText(
    [anime?.titre_en, anime?.titre_jp, anime?.synopsis_en, anime?.format, anime?.statut, genres]
      .filter(Boolean)
      .join(' '),
    ''
  ).toLowerCase()
}

function normalizeSearchText(value) {
  const cleaned = cleanEnglishText(value, '').toLowerCase()
  return cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function getSearchTitleForAnime(anime) {
  return cleanEnglishText(anime?.titre_en || anime?.titre_jp, '')
}

function createSearchBigrams(value) {
  if (value.length < 2) return []

  const bigrams = []
  for (let index = 0; index < value.length - 1; index += 1) {
    bigrams.push(value.slice(index, index + 2))
  }

  return bigrams
}

function getDiceCoefficient(firstValue, secondValue) {
  if (!firstValue || !secondValue) return 0
  if (firstValue === secondValue) return 1

  const firstBigrams = createSearchBigrams(firstValue)
  const secondBigrams = createSearchBigrams(secondValue)
  if (!firstBigrams.length || !secondBigrams.length) return 0

  const firstBigramCount = new Map()
  firstBigrams.forEach((bigram) => {
    firstBigramCount.set(bigram, (firstBigramCount.get(bigram) || 0) + 1)
  })

  let overlapCount = 0
  secondBigrams.forEach((bigram) => {
    const availableCount = firstBigramCount.get(bigram) || 0
    if (availableCount <= 0) return
    firstBigramCount.set(bigram, availableCount - 1)
    overlapCount += 1
  })

  return (2 * overlapCount) / (firstBigrams.length + secondBigrams.length)
}

function getLevenshteinSimilarity(firstValue, secondValue) {
  if (!firstValue || !secondValue) return 0
  if (firstValue === secondValue) return 1

  const firstLength = firstValue.length
  const secondLength = secondValue.length
  if (firstLength === 0 || secondLength === 0) return 0

  const previousRow = new Array(secondLength + 1).fill(0)
  const currentRow = new Array(secondLength + 1).fill(0)

  for (let secondIndex = 0; secondIndex <= secondLength; secondIndex += 1) {
    previousRow[secondIndex] = secondIndex
  }

  for (let firstIndex = 1; firstIndex <= firstLength; firstIndex += 1) {
    currentRow[0] = firstIndex

    for (let secondIndex = 1; secondIndex <= secondLength; secondIndex += 1) {
      const substitutionCost =
        firstValue[firstIndex - 1] === secondValue[secondIndex - 1] ? 0 : 1

      currentRow[secondIndex] = Math.min(
        previousRow[secondIndex] + 1,
        currentRow[secondIndex - 1] + 1,
        previousRow[secondIndex - 1] + substitutionCost
      )
    }

    for (let secondIndex = 0; secondIndex <= secondLength; secondIndex += 1) {
      previousRow[secondIndex] = currentRow[secondIndex]
    }
  }

  const distance = previousRow[secondLength]
  const maxLength = Math.max(firstLength, secondLength)
  return maxLength > 0 ? 1 - distance / maxLength : 0
}

function getTokenCoverageScore(queryText, candidateText) {
  const queryTokens = queryText.split(' ').filter(Boolean)
  const candidateTokens = candidateText.split(' ').filter(Boolean)
  if (!queryTokens.length || !candidateTokens.length) return 0

  const matchedTokenCount = queryTokens.filter((queryToken) => {
    return candidateTokens.some(
      (candidateToken) =>
        candidateToken.startsWith(queryToken) ||
        queryToken.startsWith(candidateToken) ||
        candidateToken.includes(queryToken)
    )
  }).length

  return matchedTokenCount / queryTokens.length
}

function getAnimeFuzzyScore(anime, queryText) {
  const normalizedQuery = normalizeSearchText(queryText)
  if (!normalizedQuery) return 0

  const normalizedTitle = normalizeSearchText(getSearchTitleForAnime(anime))
  const normalizedBlob = normalizeSearchText(getAnimeSearchBlob(anime))
  if (!normalizedTitle && !normalizedBlob) return 0

  if (normalizedTitle === normalizedQuery) return 1
  if (normalizedTitle.startsWith(normalizedQuery)) return 0.98
  if (normalizedTitle.includes(normalizedQuery)) return 0.92
  if (normalizedBlob.includes(normalizedQuery)) return 0.86

  const diceScore = getDiceCoefficient(normalizedQuery, normalizedTitle || normalizedBlob)
  const levenshteinScore = getLevenshteinSimilarity(normalizedQuery, normalizedTitle || normalizedBlob)
  const tokenCoverageScore = getTokenCoverageScore(normalizedQuery, normalizedTitle || normalizedBlob)

  return diceScore * 0.5 + levenshteinScore * 0.35 + tokenCoverageScore * 0.15
}

function getFuzzyAnimeMatches(animes, queryText, limit = SEARCH_FUZZY_LIMIT) {
  const normalizedQuery = normalizeSearchText(queryText)
  if (!normalizedQuery || normalizedQuery.length < 2) return []

  const candidates = (animes || [])
    .map((anime) => ({
      anime,
      score: getAnimeFuzzyScore(anime, normalizedQuery)
    }))
    .filter((entry) => entry.score > 0)
    .sort((entryA, entryB) => entryB.score - entryA.score)

  const strictMatches = candidates
    .filter((entry) => entry.score >= SEARCH_FUZZY_MIN_SCORE)
    .slice(0, limit)
    .map((entry) => entry.anime)

  if (strictMatches.length) return strictMatches

  return candidates
    .filter((entry) => entry.score >= 0.18)
    .slice(0, Math.max(8, Math.min(limit, 20)))
    .map((entry) => entry.anime)
}

async function getSearchDbPoolAnimes() {
  if (searchDbPoolAnimes.length) {
    scheduleSearchDbPoolCacheCleanup()
    return searchDbPoolAnimes
  }

  if (searchDbPoolPromise) return searchDbPoolPromise

  if (!window.api?.db?.getAnimesLite && !window.api?.db?.getAnimes) {
    return []
  }

  searchDbPoolPromise = (async () => {
    let items = []

    if (window.api?.db?.getAnimesLite) {
      items = await window.api.db.getAnimesLite('', SEARCH_DB_POOL_MAX_ITEMS)
    } else if (window.api?.db?.getAnimes) {
      items = await window.api.db.getAnimes('')
    }

    searchDbPoolAnimes = normalizeAnimeCollection(items, SEARCH_DB_POOL_MAX_ITEMS)
    scheduleSearchDbPoolCacheCleanup()
    return searchDbPoolAnimes
  })()
    .catch((error) => {
      console.warn('Failed to load lightweight anime pool for fuzzy search:', error)
      searchDbPoolAnimes = []
      return searchDbPoolAnimes
    })
    .finally(() => {
      searchDbPoolPromise = null
    })

  return searchDbPoolPromise
}

function clearSearchDbPoolCache() {
  searchDbPoolAnimes = []

  if (!searchDbPoolCleanupTimer) return
  clearTimeout(searchDbPoolCleanupTimer)
  searchDbPoolCleanupTimer = null
}

function scheduleSearchDbPoolCacheCleanup() {
  if (searchDbPoolCleanupTimer) {
    clearTimeout(searchDbPoolCleanupTimer)
  }

  searchDbPoolCleanupTimer = setTimeout(() => {
    searchDbPoolAnimes = []
    searchDbPoolCleanupTimer = null
  }, SEARCH_DB_POOL_CACHE_TTL_MS)
}

function filterAnimesByQuery(animes, queryText) {
  const query = normalizeSearchText(queryText)
  if (!query) return animes || []

  return (animes || []).filter((anime) => {
    const searchBlob = normalizeSearchText(getAnimeSearchBlob(anime))
    const rawTitle = normalizeSearchText(cleanDisplayText(anime?.titre_en || anime?.titre_jp, ''))
    return searchBlob.includes(query) || rawTitle.includes(query)
  })
}

function renderSearchRecommendedGrid(animes, emptyMessage = 'No recommended anime available.') {
  renderAnimeGrid({
    gridEl: searchRecommendedGridEl,
    animes,
    emptyMessage,
    sourceView: 'search'
  })
}

function getSearchFallbackPool() {
  const homeAnimePool = homeLatestEpisodes
    .map((episode) => episode?.anime)
    .filter(Boolean)

  return uniqueAnimeById(
    normalizeAnimeCollection([
      ...searchRecommendedAnimes,
      ...homeAnimePool,
      ...topRatedAnimes
    ])
  )
}

function mapScraperAnimeToEntry(item = {}, sourceId = SCRAPER_DEFAULT_SOURCE_ID) {
  const id = cleanDisplayText(item?.id || item?.sourceAnimeId || item?.slug, '')
  if (!id) return null

  const rawTitle = cleanDisplayText(item?.title || item?.slug, 'Untitled')
  const title = cleanEnglishText(rawTitle, rawTitle)

  return buildHomeAnimeEntry({
    id,
    scraperAnimeId: cleanDisplayText(item?.sourceAnimeId || id, id),
    sourceType: 'scraper',
    sourceId,
    titre_en: title,
    poster_url: cleanDisplayText(item?.coverImage || '', ''),
    synopsis_en: '',
    format: 'Web',
    genres: []
  })
}

async function searchScraperAnimes(queryText, sourceId = SCRAPER_DEFAULT_SOURCE_ID) {
  if (!window.api?.scraper?.searchAnime) return []

  try {
    const payload = await window.api.scraper.searchAnime(queryText, sourceId)
    const items = Array.isArray(payload?.items) ? payload.items : []

    return items
      .slice(0, SCRAPER_SEARCH_LIMIT)
      .map((item) => mapScraperAnimeToEntry(item, sourceId))
      .filter(Boolean)
  } catch (error) {
    console.warn('Scraper search failed:', error)
    return []
  }
}

async function loadSearchRecommendations(forceReload = false) {
  if (!searchRecommendedGridEl) return

  if (searchRecommendedAnimes.length && !forceReload) {
    const currentQuery = cleanEnglishText(searchTopInputEl?.value, '')
    if (currentQuery) {
      void runSearchQuery(currentQuery)
      return
    }

    searchCurrentResultsAnimes = []
    setSearchRecommendedLabel('Recommended animes')
    renderSearchRecommendedGrid(searchRecommendedAnimes)
    return
  }

  setSearchRecommendedLoading()

  let animes = topRatedCatalogAnimes
  if (!animes.length) {
    animes = await loadTopRatedCatalogFromDb(TOP_RATED_LIMIT)
    topRatedCatalogAnimes = animes
  }

  if (!animes.length) {
    animes = getSearchFallbackPool()
  }

  searchRecommendedAnimes = normalizeAnimeCollection(
    uniqueAnimeById(animes),
    HOME_LIMIT
  )
  searchCurrentResultsAnimes = []
  setSearchRecommendedLabel('Recommended animes')
  renderSearchRecommendedGrid(searchRecommendedAnimes)
}

async function runSearchQuery(rawQuery) {
  if (!searchRecommendedGridEl) return

  const query = cleanEnglishText(rawQuery, '')
  if (!query) {
    clearSearchDbPoolCache()
    searchCurrentResultsAnimes = []
    setSearchRecommendedLabel('Recommended animes')
    renderSearchRecommendedGrid(searchRecommendedAnimes)
    return
  }

  const requestId = ++searchQueryRequestId
  setSearchRecommendedLoading()

  let dbMatches = []
  let dbPool = []
  let scraperMatches = []

  const dbPoolPromise = getSearchDbPoolAnimes()
  const scraperPromise = searchScraperAnimes(query)

  if (window.api?.db?.getAnimesLite) {
    try {
      dbMatches = await window.api.db.getAnimesLite(query, SEARCH_DB_DIRECT_LIMIT)
    } catch (err) {
      console.warn('Lightweight database search failed:', err)
    }
  } else if (window.api?.db?.getAnimes) {
    try {
      dbMatches = await window.api.db.getAnimes(query)
    } catch (err) {
      console.warn('Database search failed:', err)
    }
  }

  dbMatches = normalizeAnimeCollection(dbMatches, SEARCH_DB_DIRECT_LIMIT)

  try {
    dbPool = await dbPoolPromise
  } catch {
    dbPool = []
  }

  try {
    scraperMatches = await scraperPromise
  } catch {
    scraperMatches = []
  }

  if (requestId !== searchQueryRequestId) return

  const fallbackPool = getSearchFallbackPool()
  const searchablePool = uniqueAnimeById([
    ...(scraperMatches || []),
    ...(dbPool || []),
    ...fallbackPool,
    ...(dbMatches || [])
  ])
  const localMatches = filterAnimesByQuery(searchablePool, query)
  const directMatches = uniqueAnimeById([...(scraperMatches || []), ...(dbMatches || []), ...localMatches])
  const fuzzyMatches = getFuzzyAnimeMatches(searchablePool, query)

  const mergedMatches = directMatches.length
    ? uniqueAnimeById([...directMatches, ...fuzzyMatches]).slice(0, 64)
    : fuzzyMatches

  if (!mergedMatches.length) {
    searchCurrentResultsAnimes = []
    setSearchRecommendedLabel('No results')
    renderSearchRecommendedGrid([], `No anime found for "${escapeHtml(query)}".`)
    return
  }

  if (!directMatches.length && fuzzyMatches.length) {
    searchCurrentResultsAnimes = fuzzyMatches
    setSearchRecommendedLabel('Closest matches')
    renderSearchRecommendedGrid(fuzzyMatches, `No exact match for "${escapeHtml(query)}". Showing closest titles.`)
    return
  }

  searchCurrentResultsAnimes = mergedMatches
  setSearchRecommendedLabel(`${mergedMatches.length} result${mergedMatches.length > 1 ? 's' : ''}`)
  renderSearchRecommendedGrid(mergedMatches)
}

function scheduleSearchQuery(rawQuery) {
  if (searchInputDebounceTimer) {
    clearTimeout(searchInputDebounceTimer)
  }

  searchInputDebounceTimer = setTimeout(() => {
    void runSearchQuery(rawQuery)
  }, SEARCH_INPUT_DEBOUNCE_MS)
}

async function resolveHomeEpisodeContext(episode) {
  if (!episode?.animeId || !episode?.anime) return

  const anime = buildHomeAnimeEntry({
    ...episode.anime,
    id: episode.animeId
  })

  const episodeQueue = await ensureEpisodeQueueForAnime(anime)
  if (!episodeQueue.length) return

  const requestedEpisodeNumberRaw = Number(episode.episodeNumber)
  const requestedEpisodeNumber =
    Number.isFinite(requestedEpisodeNumberRaw) && requestedEpisodeNumberRaw > 0
      ? Math.trunc(requestedEpisodeNumberRaw)
      : 1

  const targetIndex = Math.max(0, Math.min(episodeQueue.length - 1, requestedEpisodeNumber - 1))
  const targetEpisode = episodeQueue[targetIndex]
  const targetTitle = formatEpisodeTitleForHome(
    episode.episodeTitle,
    requestedEpisodeNumber
  )

  return {
    anime,
    episodeQueue,
    requestedEpisodeNumber,
    targetIndex,
    targetEpisode,
    targetTitle
  }
}

function closeHomeEpisodeActionBoxes(exceptCard = null) {
  document.querySelectorAll('#view-library .episode-card.is-actions-open').forEach((card) => {
    if (exceptCard && card === exceptCard) return
    card.classList.remove('is-actions-open')
  })
}

async function openLatestEpisodeFromHome(episode) {
  const context = await resolveHomeEpisodeContext(episode)
  if (!context) return

  const {
    anime,
    episodeQueue,
    requestedEpisodeNumber,
    targetIndex,
    targetEpisode,
    targetTitle
  } = context

  if (targetEpisode) {
    targetEpisode.order = requestedEpisodeNumber
    targetEpisode.title = targetTitle
    targetEpisode.displayTitle = `Episode ${requestedEpisodeNumber} · ${targetTitle}`
  }

  playerEpisodeAnime = anime
  playerEpisodeQueue = episodeQueue
  playerEpisodeIndex = -1
  updateEpisodeNavState()

  await playEpisodeByIndex(targetIndex)
}

async function downloadLatestEpisodeFromHome(episode) {
  const context = await resolveHomeEpisodeContext(episode)
  if (!context) return

  const { anime, targetEpisode, requestedEpisodeNumber } = context
  if (!targetEpisode) return

  await hydrateEpisodeSources(targetEpisode)
  const sourceUrl = getEpisodeSourceByQuality(targetEpisode, 'auto') || targetEpisode.src || ''
  if (!sourceUrl) return

  const animeTitle = cleanEnglishText(anime.titre_en || anime.titre_jp, 'Anime')
  const fileName = `${animeTitle} - Episode ${requestedEpisodeNumber}.webm`

  const anchor = document.createElement('a')
  anchor.href = sourceUrl
  anchor.download = fileName
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function renderLatestEpisodesGrid({
  gridEl,
  episodes,
  emptyMessage = 'No latest episodes found.',
  append = false,
  disableEntryAnimation = false
}) {
  if (!gridEl) return

  if (!append) {
    gridEl.innerHTML = ''
  }

  if (!episodes || episodes.length === 0) {
    if (!append) {
      gridEl.innerHTML = `<p class="empty-msg">${emptyMessage}</p>`
    }
    return
  }

  const fragment = document.createDocumentFragment()

  episodes.forEach((episode) => {
    if (!episode?.animeId || !episode?.anime) return

    const card = document.createElement('div')
    card.className = 'anime-card episode-card'
    if (disableEntryAnimation) {
      card.classList.add('no-entry-animation')
    }

    const animeTitle = cleanEnglishText(episode.anime.titre_en || episode.anime.titre_jp, 'Untitled')
    const episodeTitle = formatEpisodeTitleForHome(episode.episodeTitle, episode.episodeNumber)
    const episodeNumberText = `Episode ${episode.episodeNumber}`
    const uploadTimeText = cleanEnglishText(episode.uploadedAgo, 'Just now')
    const poster = episode.anime.poster_url || ''

    card.innerHTML = `
      <img loading="lazy" decoding="async" src="${poster}" alt="${escapeHtml(animeTitle)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22><rect fill=%22%23333%22 width=%22200%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22>No Poster</text></svg>'">
      <div class="card-info">
        <p class="card-title">${escapeHtml(animeTitle)}</p>
        <p class="card-subtitle">${escapeHtml(episodeTitle)}</p>
        <div class="card-episode-meta">
          <span class="episode-number-pill">${escapeHtml(episodeNumberText)}</span>
          <span class="episode-upload-time">${escapeHtml(uploadTimeText)}</span>
        </div>
      </div>
      <div class="episode-action-box" aria-label="Episode actions">
        <button type="button" class="episode-action-btn episode-action-watch" aria-label="Watch episode" title="Watch">
          <i class="fa-solid fa-play" aria-hidden="true"></i>
        </button>
        <button type="button" class="episode-action-btn episode-action-download" aria-label="Download episode" title="Download">
          <i class="fa-solid fa-download" aria-hidden="true"></i>
        </button>
      </div>
    `

    const watchActionBtn = card.querySelector('.episode-action-watch')
    const downloadActionBtn = card.querySelector('.episode-action-download')

    watchActionBtn?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeHomeEpisodeActionBoxes()
      void openLatestEpisodeFromHome(episode)
    })

    downloadActionBtn?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeHomeEpisodeActionBoxes()
      void downloadLatestEpisodeFromHome(episode)
    })

    card.addEventListener('click', (event) => {
      if (event.target.closest('.episode-action-btn')) return
      const shouldOpen = !card.classList.contains('is-actions-open')
      closeHomeEpisodeActionBoxes(card)
      card.classList.toggle('is-actions-open', shouldOpen)
    })
    fragment.appendChild(card)
  })

  gridEl.appendChild(fragment)
}

function setHomeLoadingState(isLoading) {
  if (!homeLoadingEl) return
  homeLoadingEl.classList.toggle('is-hidden', !isLoading)
  homeLoadingEl.setAttribute('aria-hidden', String(!isLoading))
}

function setTopRatedLoadingState(isLoading) {
  if (!topRatedLoadingEl) return
  topRatedLoadingEl.classList.toggle('is-hidden', !isLoading)
  topRatedLoadingEl.setAttribute('aria-hidden', String(!isLoading))
}

async function loadAnimes() {
  if (!grid) return

  homeHasMore = false
  homeIsLoadingMore = false
  homeLatestEpisodes = []
  setHomeLoadingState(false)
  grid.innerHTML = getGridLoadingMarkup()

  const latestEpisodeRows = await fetchLatestEpisodesFromDb(HOME_LIMIT)

  if (latestEpisodeRows.length) {
    homeLatestEpisodes = latestEpisodeRows
      .map((episode, index) => mapLatestEpisodeItem(episode, index))
      .filter(Boolean)
  } else {
    homeLatestEpisodes = []
  }

  renderLatestEpisodesGrid({
    gridEl: grid,
    episodes: homeLatestEpisodes,
    emptyMessage: 'No latest episodes available.'
  })
}

async function loadMoreHomeAnimes() {
  homeHasMore = false
}

async function loadTopRatedAnimes() {
  if (!topRatedGrid) return

  topRatedNextPage = TOP_RATED_INITIAL_LIMIT
  topRatedHasMore = false
  topRatedIsLoadingMore = false
  setTopRatedLoadingState(false)
  topRatedGrid.innerHTML = getGridLoadingMarkup()

  topRatedCatalogAnimes = await loadTopRatedCatalogFromDb(TOP_RATED_LIMIT)
  topRatedAnimes = topRatedCatalogAnimes.slice(0, TOP_RATED_INITIAL_LIMIT)
  topRatedHasMore = topRatedCatalogAnimes.length > topRatedAnimes.length
  topRatedNextPage = topRatedAnimes.length

  renderAnimeGrid({
    gridEl: topRatedGrid,
    animes: topRatedAnimes,
    emptyMessage: 'No top-rated anime available.',
    sourceView: 'top-rated'
  })
}

async function loadMoreTopRatedAnimes() {
  if (!topRatedGrid || topRatedIsLoadingMore || !topRatedHasMore) return

  topRatedIsLoadingMore = true
  setTopRatedLoadingState(true)

  try {
    const nextBatch = topRatedCatalogAnimes.slice(topRatedNextPage, topRatedNextPage + TOP_RATED_PAGE_SIZE)

    topRatedNextPage += nextBatch.length
    topRatedHasMore = topRatedNextPage < topRatedCatalogAnimes.length

    if (nextBatch.length) {
      topRatedAnimes = [...topRatedAnimes, ...nextBatch]
      renderAnimeGrid({
        gridEl: topRatedGrid,
        animes: nextBatch,
        sourceView: 'top-rated',
        append: true,
        disableEntryAnimation: true
      })
    }
  } catch (err) {
    console.warn('Failed to load more top-rated entries from local catalog:', err)
    topRatedHasMore = false
  } finally {
    topRatedIsLoadingMore = false
    setTopRatedLoadingState(false)
  }
}

function handleMainContentScroll() {
  if (!mainContentEl || scrollTicking) return

  closeHomeEpisodeActionBoxes()

  scrollTicking = true
  requestAnimationFrame(() => {
    scrollTicking = false

    const remaining =
      mainContentEl.scrollHeight - mainContentEl.scrollTop - mainContentEl.clientHeight
    if (remaining > SCROLL_BOTTOM_THRESHOLD) return

    if (topRatedViewEl && !topRatedViewEl.classList.contains('hidden')) {
      if (!topRatedHasMore || topRatedIsLoadingMore) return
      void loadMoreTopRatedAnimes()
      return
    }

    if (libraryViewEl && !libraryViewEl.classList.contains('hidden')) {
      if (!homeHasMore || homeIsLoadingMore) return
      void loadMoreHomeAnimes()
    }
  })
}

async function openAnimeDetail(animeId, sourceView = 'library') {
  const anime = findAnimeById(animeId)
  if (!anime) return
  detailReturnView = sourceView

  const title = cleanDisplayText(anime.titre_en || anime.titre_jp, 'Untitled')
  const posterUrl = getAnimePosterUrl(anime)
  const synopsis = await getAnimeDetailSynopsis(anime.id, anime.synopsis_en || '')
  const synopsisPreview = getSynopsisPreviewState(synopsis)
  const synopsisMarkup = synopsisPreview.fullText
    ? synopsisPreview.isLong
      ? `<div class="detail-synopsis"><p id="detail-synopsis-text" class="synopsis">${escapeHtml(synopsisPreview.collapsedText)}</p><button type="button" id="detail-synopsis-toggle" class="synopsis-toggle" aria-expanded="false">See more..</button></div>`
      : `<p class="synopsis">${escapeHtml(synopsisPreview.fullText)}</p>`
    : ''
  const format = cleanEnglishText(anime.format, '')
  const status = normalizeStatus(anime.statut)
  const rank = anime.rank ? `#${anime.rank}` : ''
  const scoreText = formatScore(anime.note_imdb)
  const ratedByText = formatCount(anime.rated_by)
  const genres = (anime.genres || []).map((genre) => cleanEnglishText(genre, '')).filter(Boolean)
  const episodeQueue = await ensureEpisodeQueueForAnime(anime)

  playerEpisodeAnime = anime
  playerEpisodeQueue = episodeQueue
  playerEpisodeIndex = -1
  updateEpisodeNavState()

  animeDetailEl.innerHTML = `
    <div class="detail-header">
      <img class="detail-poster" src="${posterUrl}" alt="${escapeHtml(title)}" onerror="this.onerror=null;this.src='${DEFAULT_POSTER_PLACEHOLDER}'">
      <div class="detail-meta">
        <div class="detail-title-row">
          <h1>${escapeHtml(title)}</h1>
          <button type="button" id="detail-copy-title" class="detail-copy-toggle" aria-label="Copy title" title="Copy title" aria-pressed="false"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
        </div>
        ${synopsisMarkup}
        <div class="meta-row">
          ${rank ? `<span class="detail-rank-badge">🏆 Rank ${rank}</span>` : ''}
          ${scoreText ? `<span class="detail-rating-badge${ratedByText ? ' has-users' : ''}"><span class="rating-score">⭐ ${scoreText}</span>${ratedByText ? `<span class="rating-users">${ratedByText} users</span>` : ''}</span>` : ''}
          ${format ? `<span>${format}</span>` : ''}
          ${status ? `<span>${status}</span>` : ''}
          ${anime.total_episodes ? `<span>${anime.total_episodes} episodes</span>` : ''}
          ${anime.year ? `<span>${anime.year}</span>` : ''}
        </div>
        ${genres.length ? `<div class="genres">${genres.map((genre) => `<span class="genre-tag">${genre}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `

  const copyTitleBtn = animeDetailEl.querySelector('#detail-copy-title')
  if (copyTitleBtn) {
    let copyResetTimer = null
    copyTitleBtn.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(title)
      if (!copied) return

      copyTitleBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>'
      copyTitleBtn.classList.add('is-copied')
      copyTitleBtn.setAttribute('aria-label', 'Copied')
      copyTitleBtn.setAttribute('title', 'Copied')
      copyTitleBtn.setAttribute('aria-pressed', 'true')

      if (copyResetTimer) {
        clearTimeout(copyResetTimer)
      }

      copyResetTimer = setTimeout(() => {
        copyTitleBtn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i>'
        copyTitleBtn.classList.remove('is-copied')
        copyTitleBtn.setAttribute('aria-label', 'Copy title')
        copyTitleBtn.setAttribute('title', 'Copy title')
        copyTitleBtn.setAttribute('aria-pressed', 'false')
      }, 1400)
    })
  }

  const synopsisTextEl = animeDetailEl.querySelector('#detail-synopsis-text')
  const synopsisToggleBtn = animeDetailEl.querySelector('#detail-synopsis-toggle')
  if (synopsisTextEl && synopsisToggleBtn && synopsisPreview.isLong) {
    let isExpanded = false

    synopsisToggleBtn.addEventListener('click', () => {
      isExpanded = !isExpanded
      synopsisTextEl.textContent = isExpanded
        ? synopsisPreview.fullText
        : synopsisPreview.collapsedText
      synopsisToggleBtn.textContent = isExpanded ? 'See less' : 'See more..'
      synopsisToggleBtn.setAttribute('aria-expanded', String(isExpanded))
    })
  }

  episodesListEl.innerHTML = `
    <h3>Episodes</h3>
    <div class="episodes-grid">
      ${episodeQueue.length
        ? episodeQueue
            .map(
              (episode, index) =>
                `<button class="episode-btn" data-episode-index="${index}">${episode.displayTitle}</button>`
            )
            .join('')
        : '<p class="empty-msg">No episodes available.</p>'}
    </div>
  `

  episodesListEl.querySelectorAll('[data-episode-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-episode-index'))
      if (!Number.isFinite(index)) return
      playEpisodeByIndex(index)
    })
  })

  episodeQueue.forEach((episode) => {
    void hydrateEpisodeSources(episode).then(() => {
      const currentEpisode = getCurrentEpisode()
      if (!currentEpisode || currentEpisode.id !== episode.id) return
      syncPlayerQualityOptions(currentEpisode)
    })
  })

  showView('detail')
}

document.getElementById('btn-back-detail')?.addEventListener('click', () => {
  showView(detailReturnView)
})

document.querySelectorAll('.activity-item[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const viewId = button.dataset.view
    if (!viewId) return

    showView(viewId)

    if (viewId !== 'library') {
      setHomeLoadingState(false)
    }

    if (viewId !== 'top-rated') {
      setTopRatedLoadingState(false)
    }

    if (viewId === 'library') {
      loadAnimes()
    }

    if (viewId === 'top-rated') {
      loadTopRatedAnimes()
    }

    if (viewId === 'search') {
      void loadSearchRecommendations()
      requestAnimationFrame(() => {
        searchTopInputEl?.focus()
      })
    }
  })
})

searchTopInputEl?.addEventListener('input', () => {
  scheduleSearchQuery(searchTopInputEl.value)
})

searchTopInputEl?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  event.preventDefault()
  searchTopInputEl.value = ''
  scheduleSearchQuery('')
  searchTopInputEl.blur()
})

document.addEventListener('click', (event) => {
  if (event.target.closest('#view-library .episode-card')) return
  closeHomeEpisodeActionBoxes()
})

async function init() {
  await applyPlatformPerformanceMode()
  setupWindowControls()
  setupCustomPlayer()
  mainContentEl?.addEventListener('scroll', handleMainContentScroll, { passive: true })
  showView('library')
  await loadAnimes()
}

init()

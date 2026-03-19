import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  db: {
    isOpen: () => ipcRenderer.invoke('db:isOpen'),
    getSavedPath: () => ipcRenderer.invoke('db:getSavedPath'),
    getAnimes: (search) => ipcRenderer.invoke('db:getAnimes', search),
    getAnimesLite: (search, limit) => ipcRenderer.invoke('db:getAnimesLite', search, limit),
    getAnimeById: (id) => ipcRenderer.invoke('db:getAnimeById', id),
    getEpisodes: (animeId) => ipcRenderer.invoke('db:getEpisodes', animeId),
    getLatestEpisodes: (limit) => ipcRenderer.invoke('db:getLatestEpisodes', limit),
    getSubtitles: (episodeId) => ipcRenderer.invoke('db:getSubtitles', episodeId)
  },
  scraper: {
    listSources: () => ipcRenderer.invoke('scraper:listSources'),
    searchAnime: (query, sourceId = 'witanime') =>
      ipcRenderer.invoke('scraper:searchAnime', { query, sourceId }),
    getEpisodes: (animeId, sourceId = 'witanime') =>
      ipcRenderer.invoke('scraper:getEpisodes', { animeId, sourceId }),
    resolveStream: (episodeId, sourceId = 'witanime') =>
      ipcRenderer.invoke('scraper:resolveStream', { episodeId, sourceId })
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximizeToggle: () => ipcRenderer.send('window:maximize-toggle'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (callback) => {
      const listener = (_, maximized) => callback(Boolean(maximized))
      ipcRenderer.on('window:maximized-changed', listener)
      return () => ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  },
  system: {
    getPlatform: () => ipcRenderer.invoke('system:getPlatform')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

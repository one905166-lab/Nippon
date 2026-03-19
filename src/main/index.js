import { app, BrowserWindow, ipcMain, nativeImage, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import {
  openDatabase,
  getBundledDbPath,
  getAnimes,
  getAnimesLite,
  getAnimeById,
  getEpisodes,
  getLatestEpisodes,
  getSubtitles,
  isDatabaseOpen,
  getActiveDatabasePath
} from './database.js'

const MIN_SPLASH_SHOW_MS = 4000
const KEEP_SPLASH_OPEN_IN_DEV = false
const SPLASH_TO_MAIN_FADE_MS = 520
const splashCloseAllowance = new WeakSet()

function resolveFirstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return ''
}

function getAppIconPath() {
  const appRoot = app.getAppPath()

  if (is.dev) {
    const devCandidates =
      process.platform === 'win32'
        ? [
            path.join(appRoot, 'build', 'icon.ico'),
            path.join(appRoot, 'src', 'renderer', 'assets', 'n.png'),
            path.join(appRoot, 'build', 'icon.png')
          ]
        : process.platform === 'darwin'
          ? [
              path.join(appRoot, 'build', 'icon.icns'),
              path.join(appRoot, 'src', 'renderer', 'assets', 'n.png'),
              path.join(appRoot, 'build', 'icon.png')
            ]
          : [
              path.join(appRoot, 'src', 'renderer', 'assets', 'n.png'),
              path.join(appRoot, 'build', 'icon.png'),
              path.join(appRoot, 'build', 'icon.ico')
            ]

    return resolveFirstExistingPath(devCandidates)
  }

  const packagedCandidates =
    process.platform === 'win32'
      ? [path.join(process.resourcesPath, 'icon.ico'), path.join(process.resourcesPath, 'icon.png')]
      : process.platform === 'darwin'
        ? [path.join(process.resourcesPath, 'icon.icns'), path.join(process.resourcesPath, 'icon.png')]
        : [path.join(process.resourcesPath, 'icon.png'), path.join(process.resourcesPath, 'icon.ico')]

  return resolveFirstExistingPath(packagedCandidates)
}

function getAppIconImage() {
  const iconPath = getAppIconPath()
  if (!iconPath) return nativeImage.createEmpty()
  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? nativeImage.createEmpty() : image
}

function bringToFront(window) {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  if (window.isFullScreen()) window.setFullScreen(false)
  window.show()
  window.focus()

  if (process.platform === 'linux') {
    window.setAlwaysOnTop(true)
    window.setAlwaysOnTop(false)
  }
}

function forceCloseSplashWindow(window) {
  if (!window || window.isDestroyed()) return
  splashCloseAllowance.add(window)
  window.setClosable(true)
  window.close()
  if (!window.isDestroyed()) {
    window.destroy()
  }
}

async function crossfadeSplashToMain(mainWindow, splashWindow, durationMs = SPLASH_TO_MAIN_FADE_MS) {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const hasSplash = splashWindow && !splashWindow.isDestroyed()
  const fadeDuration = Math.max(120, durationMs)
  const steps = Math.max(8, Math.round(fadeDuration / 16))
  const stepDuration = Math.max(8, Math.round(fadeDuration / steps))

  mainWindow.setOpacity(0)
  bringToFront(mainWindow)

  if (!hasSplash) {
    mainWindow.setOpacity(1)
    return
  }

  return new Promise((resolve) => {
    let step = 0
    const timer = setInterval(() => {
      step += 1
      const progress = Math.min(step / steps, 1)

      if (!mainWindow.isDestroyed()) {
        mainWindow.setOpacity(progress)
      }

      if (!splashWindow.isDestroyed()) {
        splashWindow.setOpacity(1 - progress)
      }

      if (progress >= 1) {
        clearInterval(timer)
        if (!mainWindow.isDestroyed()) {
          mainWindow.setOpacity(1)
        }
        if (!splashWindow.isDestroyed()) {
          forceCloseSplashWindow(splashWindow)
        }
        resolve()
      }
    }, stepDuration)
  })
}

function getWindowedBounds() {
  const { workArea } = screen.getPrimaryDisplay()
  let width = Math.max(760, Math.min(1200, Math.floor(workArea.width * 0.88)))
  let height = Math.max(560, Math.min(800, Math.floor(workArea.height * 0.88)))
  width = Math.min(width, workArea.width - 24)
  height = Math.min(height, workArea.height - 24)
  const x = workArea.x + Math.floor((workArea.width - width) / 2)
  const y = workArea.y + Math.floor((workArea.height - height) / 2)
  return { x, y, width, height }
}

function enforceWindowedMode(window) {
  if (!window || window.isDestroyed()) return
  if (window.isFullScreen()) window.setFullScreen(false)
  if (window.isMaximized()) window.unmaximize()
  window.setBounds(getWindowedBounds(), false)
}

function applyRoundedWindowShape(window, radius = 18) {
  if (!window || window.isDestroyed()) return
  if (process.platform !== 'linux') return
  if (typeof window.setShape !== 'function') return

  const [width, height] = window.getSize()
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)))
  if (r === 0) {
    window.setShape([{ x: 0, y: 0, width, height }])
    return
  }

  const rects = [
    { x: r, y: 0, width: width - r * 2, height },
    { x: 0, y: r, width, height: height - r * 2 }
  ]

  for (let y = 0; y < r; y++) {
    const inset = Math.ceil(r - Math.sqrt(r * r - (r - y) * (r - y)))
    const rowWidth = width - inset * 2
    rects.push({ x: inset, y, width: rowWidth, height: 1 })
    rects.push({ x: inset, y: height - y - 1, width: rowWidth, height: 1 })
  }

  window.setShape(rects)
}

function syncWindowShapeWithState(window) {
  if (!window || window.isDestroyed()) return
  const radius = window.isMaximized() ? 0 : 18
  applyRoundedWindowShape(window, radius)
}

function setupIpcHandlers() {
  ipcMain.handle('db:getAnimes', (_, search) => getAnimes(search))
  ipcMain.handle('db:getAnimesLite', (_, search, limit) => getAnimesLite(search, limit))
  ipcMain.handle('db:getAnimeById', (_, id) => getAnimeById(id))
  ipcMain.handle('db:getEpisodes', (_, animeId) => getEpisodes(animeId))
  ipcMain.handle('db:getLatestEpisodes', (_, limit) => getLatestEpisodes(limit))
  ipcMain.handle('db:getSubtitles', (_, episodeId) => getSubtitles(episodeId))
  ipcMain.handle('db:isOpen', () => isDatabaseOpen())
  ipcMain.handle('db:getSavedPath', () => getActiveDatabasePath())
  ipcMain.handle('system:getPlatform', () => process.platform)

  ipcMain.on('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  ipcMain.on('window:maximize-toggle', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window?.isMaximized() ?? false
  })
}

function createSplashWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const splashWidth = 420
  const splashHeight = 280
  const splashX = workArea.x + Math.floor((workArea.width - splashWidth) / 2)
  const splashY = workArea.y + Math.floor((workArea.height - splashHeight) / 2)

  const splashWindow = new BrowserWindow({
    x: splashX,
    y: splashY,
    width: splashWidth,
    height: splashHeight,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b0b0b',
    icon: getAppIconPath(),
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (is.dev) {
    splashWindow.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'splash.html'))
  } else {
    splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'))
  }

  splashWindow.once('ready-to-show', () => {
    splashWindow.setMovable(false)
    splashWindow.setResizable(false)
    splashWindow.setClosable(false)

    const iconPath = getAppIconPath()
    if (iconPath && typeof splashWindow.setIcon === 'function') {
      splashWindow.setIcon(iconPath)
    }

    bringToFront(splashWindow)
  })

  splashWindow.on('will-move', (event) => {
    event.preventDefault()
  })

  splashWindow.on('will-resize', (event) => {
    event.preventDefault()
  })

  splashWindow.on('close', (event) => {
    if (splashCloseAllowance.has(splashWindow)) return
    event.preventDefault()
  })

  splashWindow.removeMenu()
  return splashWindow
}

function createWindow(splashWindow = null, splashShownAt = 0) {
  const bounds = getWindowedBounds()
  const rendererDevUrl =
    process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL'] || ''

  // Fenêtre Principale
  const mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 520,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    icon: getAppIconPath(),
    fullscreen: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (is.dev && rendererDevUrl) {
    mainWindow.loadURL(rendererDevUrl)
  } else if (is.dev) {
    mainWindow.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'index.html'))
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.removeMenu()

  const sendMaximizedState = () => {
    if (!mainWindow.isDestroyed()) {
      syncWindowShapeWithState(mainWindow)
      mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized())
    }
  }

  mainWindow.on('maximize', sendMaximizedState)
  mainWindow.on('unmaximize', sendMaximizedState)
  mainWindow.on('resize', () => syncWindowShapeWithState(mainWindow))

  mainWindow.once('ready-to-show', async () => {
    if (splashWindow && !splashWindow.isDestroyed() && splashShownAt > 0) {
      const elapsed = Date.now() - splashShownAt
      const remaining = MIN_SPLASH_SHOW_MS - elapsed
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
    }

    enforceWindowedMode(mainWindow)
    syncWindowShapeWithState(mainWindow)

    const iconPath = getAppIconPath()
    if (iconPath && typeof mainWindow.setIcon === 'function') {
      mainWindow.setIcon(iconPath)
    }

    await crossfadeSplashToMain(mainWindow, splashWindow)
    sendMaximizedState()
  })

  return mainWindow
}

// CETTE PARTIE EST ESSENTIELLE POUR LANCER L'APP
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron.app.nippon')
  }

  if (process.platform === 'darwin') {
    const iconImage = getAppIconImage()
    if (!iconImage.isEmpty()) {
      app.dock.setIcon(iconImage)
    }
  }

  setupIpcHandlers()

  const envDbPathRaw = String(process.env.NIPPON_DB_PATH || '').trim()
  const envDbPath = envDbPathRaw ? path.resolve(envDbPathRaw) : ''
  const dbPath = envDbPath && fs.existsSync(envDbPath) ? envDbPath : getBundledDbPath()

  if (dbPath) {
    try {
      openDatabase(dbPath)
      console.log(`Database opened: ${dbPath}`)
    } catch (err) {
      console.error('Failed to open database:', err)
    }
  } else {
    console.warn('No database file found. Expected a .db/.sqlite/.sqlite3 file in the bundled database folder.')
  }

  const splashWindow = createSplashWindow()

  if (is.dev && KEEP_SPLASH_OPEN_IN_DEV) {
    return
  }

  const splashShownAt = Date.now()
  createWindow(splashWindow, splashShownAt)

  app.on('activate', () => {
    if (is.dev && KEEP_SPLASH_OPEN_IN_DEV) {
      const splash = BrowserWindow.getAllWindows()[0]
      if (splash) {
        bringToFront(splash)
      } else {
        const reopenedSplash = createSplashWindow()
        bringToFront(reopenedSplash)
      }
      return
    }

    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      enforceWindowedMode(mainWindow)
      bringToFront(mainWindow)
    } else {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

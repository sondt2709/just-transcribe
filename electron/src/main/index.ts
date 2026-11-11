import { app, BrowserWindow, ipcMain, shell, screen, dialog } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startPythonBackend, stopPythonBackend, getBackendPort } from './python'
import {
  checkSetupStatus,
  ensureAppDirectory,
  setupPythonSource,
  copyAudiotee,
  setupPythonEnv,
  setPythonDir,
  readElectronConfig,
  writeElectronConfig,
  saveAsrProvider,
  backendNeedsRefresh,
  writeBackendVersion
} from './setup'
import { createTray, updateTrayState, destroyTray } from './tray'
import {
  resolveOverlayBounds,
  gridBoundsForOverlay,
  displayForBounds,
  placementFromBounds,
  parsePlacement,
  serializePlacement,
  type DisplayInfo,
  type Rect,
  type SavedPlacement
} from './overlayPlacement'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let activeMode: 'main' | 'overlay' = 'main'
let isRecording = false
let isQuitting = false
let clickThrough = false

function getElectronRoot(): string {
  return is.dev ? join(__dirname, '..', '..') : app.getAppPath()
}

// ── Overlay placement ──

// The overlay saves its display and position when the user drags or resizes it,
// and goes back there on launch and when displays are added, removed or resized.

const PLACEMENT_SAVE_DELAY_MS = 400 // 'moved' fires during the whole drag on macOS
const PROGRAMMATIC_MOVE_GRACE_MS = 500
const DISPLAY_CHANGE_DELAY_MS = 300
const DISPLAY_CHANGE_GRACE_MS = 1500 // macOS moves windows itself around a display change

let ignoreOverlayMovesUntil = 0
let lastDisplayChangeAt = 0
let userAdjustingOverlay = false
let placementSaveTimer: ReturnType<typeof setTimeout> | null = null
let displayChangeTimer: ReturnType<typeof setTimeout> | null = null

function displayInfos(): DisplayInfo[] {
  return screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea }))
}

function readSavedPlacement(): SavedPlacement | null {
  const cfg = readElectronConfig()
  return parsePlacement(cfg.overlay_display_id, cfg.overlay_bounds)
}

function resolveCurrentOverlayBounds(): Rect {
  return resolveOverlayBounds({
    saved: readSavedPlacement(),
    displays: displayInfos(),
    primaryId: screen.getPrimaryDisplay().id,
    position: readElectronConfig().overlay_position
  })
}

function savePlacementFromBounds(bounds: Rect): void {
  const display = displayForBounds(bounds, displayInfos(), screen.getPrimaryDisplay().id)
  writeElectronConfig(serializePlacement(placementFromBounds(bounds, display)))
}

/** Move the overlay from code. These moves do not overwrite the saved placement. */
function setOverlayBoundsFromCode(bounds: Rect): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  ignoreOverlayMovesUntil = Date.now() + PROGRAMMATIC_MOVE_GRACE_MS
  overlayWindow.setBounds(bounds)
}

function onOverlayMovedOrResized(): void {
  if (!userAdjustingOverlay && Date.now() < ignoreOverlayMovesUntil) return
  if (placementSaveTimer) clearTimeout(placementSaveTimer)
  placementSaveTimer = setTimeout(() => {
    placementSaveTimer = null
    const userInitiated = userAdjustingOverlay
    userAdjustingOverlay = false
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (!userInitiated) {
      // A move that the user did not start comes from macOS (display change).
      // Keep the saved placement while its display is missing or just changed.
      if (Date.now() - lastDisplayChangeAt < DISPLAY_CHANGE_GRACE_MS) return
      const saved = readSavedPlacement()
      if (saved && !displayInfos().some((d) => d.id === saved.displayId)) return
    }
    savePlacementFromBounds(overlayWindow.getBounds())
  }, PLACEMENT_SAVE_DELAY_MS)
}

function onDisplaysChanged(): void {
  lastDisplayChangeAt = Date.now()
  if (displayChangeTimer) clearTimeout(displayChangeTimer)
  displayChangeTimer = setTimeout(() => {
    displayChangeTimer = null
    lastDisplayChangeAt = Date.now()
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    const target = resolveCurrentOverlayBounds()
    const now = overlayWindow.getBounds()
    if (target.x !== now.x || target.y !== now.y || target.width !== now.width || target.height !== now.height) {
      setOverlayBoundsFromCode(target)
    }
  }, DISPLAY_CHANGE_DELAY_MS)
}

// ── Window creation ──

function createMainWindow(): void {
  // Room for transcript + summary + the sidebar with the Speak section, within the screen
  const workArea = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1280, workArea.width),
    height: Math.min(880, workArea.height),
    minWidth: 960, // transcript keeps ~320 px next to the summary panel and the sidebar
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (activeMode === 'main') mainWindow?.show()
  })

  // Hide instead of close
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createOverlayWindow(): void {
  const bounds = resolveCurrentOverlayBounds()

  overlayWindow = new BrowserWindow({
    ...bounds,
    minWidth: 280,
    minHeight: 200,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Prevent close from destroying — just hide
  overlayWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      overlayWindow?.hide()
    }
  })

  overlayWindow.webContents.on('did-finish-load', () => {
    applyOverlayInteractionMode()
  })

  // 'will-move' / 'will-resize' fire only for moves and resizes that the user starts.
  overlayWindow.on('will-move', () => {
    userAdjustingOverlay = true
  })
  overlayWindow.on('will-resize', () => {
    userAdjustingOverlay = true
  })
  overlayWindow.on('moved', onOverlayMovedOrResized)
  overlayWindow.on('resized', onOverlayMovedOrResized)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#overlay')
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }
}

// ── Overlay interaction mode (interactive vs click-through) ──

function applyOverlayInteractionMode(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  overlayWindow.setFocusable(!clickThrough)
  overlayWindow.webContents.send('overlay-mode-changed', { clickThrough })
}

function setOverlayClickThrough(value: boolean): void {
  clickThrough = value
  applyOverlayInteractionMode()
  writeElectronConfig({ overlay_click_through: value })
  updateTrayState(isRecording, activeMode === 'overlay', clickThrough)
}

// ── Mode switching ──

function switchToOverlay(): void {
  activeMode = 'overlay'
  mainWindow?.hide()
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
    // Wait for first paint before showing to avoid flash
    overlayWindow?.once('ready-to-show', () => {
      overlayWindow?.show()
      const port = getBackendPort()
      if (port) overlayWindow?.webContents.send('backend-started', { port })
    })
  } else {
    overlayWindow.show()
    const port = getBackendPort()
    if (port) overlayWindow.webContents.send('backend-started', { port })
  }
  updateTrayState(isRecording, true, clickThrough)
  writeElectronConfig({ overlay_enabled: true })
}

function switchToMain(): void {
  activeMode = 'main'
  overlayWindow?.hide()
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
  mainWindow?.show()
  updateTrayState(isRecording, false, clickThrough)
  writeElectronConfig({ overlay_enabled: false })
}

// ── Recording control (from tray) ──

async function startRecording(): Promise<void> {
  const port = getBackendPort()
  if (!port) return

  try {
    await fetch(`http://127.0.0.1:${port}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mic: true, speaker: true })
    })

    isRecording = true

    // If overlay mode and overlay not visible, show it
    if (activeMode === 'overlay') {
      if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
      overlayWindow?.show()
    }

    updateTrayState(true, activeMode === 'overlay', clickThrough)

    // Notify all windows of recording state change
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('recording-state', { recording: true })
    }
  } catch (err) {
    console.error('Failed to start recording from tray:', err)
  }
}

async function stopRecording(): Promise<void> {
  const port = getBackendPort()
  if (!port) return

  try {
    await fetch(`http://127.0.0.1:${port}/api/stop`, {
      method: 'POST'
    })
  } catch (err) {
    console.error('Failed to stop recording from tray:', err)
  }

  isRecording = false
  updateTrayState(false, activeMode === 'overlay', clickThrough)

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('recording-state', { recording: false })
  }
}

function quitApp(): void {
  isQuitting = true
  if (isRecording) {
    const port = getBackendPort()
    if (port) {
      fetch(`http://127.0.0.1:${port}/api/stop`, { method: 'POST' }).catch(() => {})
    }
  }
  stopPythonBackend()
  destroyTray()
  app.quit()
}

// ── App lifecycle ──

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.just-transcribe.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // In dev mode, point PYTHON_DIR to the source directory directly
  if (is.dev) {
    const devPythonDir = join(getElectronRoot(), '..', 'python')
    setPythonDir(devPythonDir)
  }

  // ── IPC handlers ──

  ipcMain.handle('get-setup-status', () => checkSetupStatus())

  ipcMain.handle('save-asr-provider', (_event, provider: string) => {
    saveAsrProvider(provider)
    return { success: true }
  })

  ipcMain.handle('reinstall-backend', async () => {
    try {
      await stopPythonBackend()
      setupPythonSource(getElectronRoot(), is.dev)
      setupPythonEnv()
      if (!is.dev) writeBackendVersion(app.getVersion())
      const port = await startPythonBackend()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-started', { port })
      }
      return { success: true, port }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('run-setup', async () => {
    try {
      const electronRoot = getElectronRoot()
      ensureAppDirectory()
      setupPythonSource(electronRoot, is.dev)
      copyAudiotee(electronRoot)
      setupPythonEnv()
      if (!is.dev) writeBackendVersion(app.getVersion())
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('start-backend', async () => {
    try {
      const port = await startPythonBackend()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-started', { port })
      }
      return { success: true, port }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('get-backend-port', () => getBackendPort())

  // Save text via the native Save dialog. The renderer never picks the path:
  // it sends both formats and the main process writes the one that matches
  // the extension the user chose (.txt -> text, anything else -> markdown).
  ipcMain.handle(
    'save-text-file',
    async (event, args: { defaultName: string; markdown: string; text: string }) => {
      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const options = {
        defaultPath: join(app.getPath('documents'), args.defaultName),
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] }
        ]
      }
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { saved: false }
      const content = result.filePath.toLowerCase().endsWith('.txt') ? args.text : args.markdown
      await writeFile(result.filePath, content, 'utf-8')
      return { saved: true, path: result.filePath }
    }
  )

  ipcMain.handle('get-electron-config', () => readElectronConfig())

  ipcMain.handle('set-overlay-click-through', (_event, value: boolean) => {
    setOverlayClickThrough(value)
  })

  ipcMain.handle('set-electron-config', (_event, updates: Record<string, unknown>) => {
    writeElectronConfig(updates as { overlay_position?: string; overlay_enabled?: boolean; launch_at_login?: boolean })

    // Handle launch-at-login (only works in production builds)
    if ('launch_at_login' in updates && !is.dev) {
      app.setLoginItemSettings({
        openAtLogin: updates.launch_at_login as boolean,
        openAsHidden: true
      })
    }

    // Handle overlay position change — grid of the display that holds the overlay
    if ('overlay_position' in updates && overlayWindow && !overlayWindow.isDestroyed()) {
      const bounds = gridBoundsForOverlay(
        updates.overlay_position as string,
        overlayWindow.getBounds(),
        displayInfos(),
        screen.getPrimaryDisplay().id
      )
      setOverlayBoundsFromCode(bounds)
      savePlacementFromBounds(bounds)
    }
  })

  // ── Tray ──

  createTray({
    onStartRecording: () => startRecording(),
    onStopRecording: () => stopRecording(),
    onShowMainWindow: () => switchToMain(),
    onShowOverlay: () => switchToOverlay(),
    onToggleClickThrough: () => setOverlayClickThrough(!clickThrough),
    onOpenSettings: () => {
      if (activeMode !== 'main') switchToMain()
      else if (!mainWindow?.isVisible()) mainWindow?.show()
      mainWindow?.webContents.send('open-settings')
    },
    onQuit: () => quitApp()
  })

  // ── Restore saved mode ──

  const electronConfig = readElectronConfig()
  if (electronConfig.overlay_enabled) {
    activeMode = 'overlay'
  }
  clickThrough = electronConfig.overlay_click_through
  updateTrayState(isRecording, activeMode === 'overlay', clickThrough)

  // Apply launch-at-login from config (only works in production builds)
  if (!is.dev) {
    app.setLoginItemSettings({
      openAtLogin: electronConfig.launch_at_login,
      openAsHidden: true
    })
  }

  // ── Create windows ──

  createMainWindow()
  createOverlayWindow()

  screen.on('display-added', onDisplaysChanged)
  screen.on('display-removed', onDisplaysChanged)
  screen.on('display-metrics-changed', onDisplaysChanged)

  // ── Auto-start backend if setup is complete ──

  const status = checkSetupStatus()
  if (status.ready) {
    try {
      if (backendNeedsRefresh(app.getVersion(), is.dev)) {
        console.log('App version changed — refreshing installed backend')
        setupPythonSource(getElectronRoot(), is.dev)
        setupPythonEnv()
        writeBackendVersion(app.getVersion())
      }
      const port = await startPythonBackend()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-started', { port })
      }
    } catch (err) {
      console.error('Failed to auto-start backend:', err)
    }
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  stopPythonBackend()
  destroyTray()
})

// Keep app alive when all windows are closed (tray mode)
app.on('window-all-closed', () => {
  // Do nothing — app stays alive in tray
})

import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { join } from 'path'
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

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let activeMode: 'main' | 'overlay' = 'main'
let isRecording = false
let isQuitting = false
let clickThrough = false

function getElectronRoot(): string {
  return is.dev ? join(__dirname, '..', '..') : app.getAppPath()
}

// ── Position calculator for 9-grid overlay placement ──

const OVERLAY_WIDTH_RATIO = 0.3
const OVERLAY_HEIGHT_RATIO = 0.5

function calculateOverlayBounds(position: string): { x: number; y: number; width: number; height: number } {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const { x: ox, y: oy } = screen.getPrimaryDisplay().workArea
  const w = Math.round(sw * OVERLAY_WIDTH_RATIO)
  const h = Math.round(sh * OVERLAY_HEIGHT_RATIO)

  const col = position.includes('left') ? 0 : position.includes('right') ? 2 : 1
  const row = position.includes('top') ? 0 : position.includes('bottom') || position.startsWith('bot') ? 2 : 1

  const margin = 20
  const xPositions = [ox + margin, ox + Math.round((sw - w) / 2), ox + sw - w - margin]
  const yPositions = [oy + margin, oy + Math.round((sh - h) / 2), oy + sh - h - margin]

  return { x: xPositions[col], y: yPositions[row], width: w, height: h }
}

// ── Window creation ──

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
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
  const config = readElectronConfig()
  const bounds = calculateOverlayBounds(config.overlay_position)

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

    // Handle overlay position change — reposition if overlay is visible
    if ('overlay_position' in updates && overlayWindow && !overlayWindow.isDestroyed()) {
      const bounds = calculateOverlayBounds(updates.overlay_position as string)
      overlayWindow.setBounds(bounds)
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

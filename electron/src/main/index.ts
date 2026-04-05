import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startPythonBackend, stopPythonBackend, getBackendPort } from './python'
import { checkSetupStatus, ensureAppDirectory, setupPythonSource, copyAudiotee, setupPythonEnv, setPythonDir, getPythonDir, saveAsrProvider } from './setup'

let mainWindow: BrowserWindow | null = null

function getElectronRoot(): string {
  // In dev, __dirname is out/main/ so electron root is ../..
  return is.dev ? join(__dirname, '..', '..') : app.getAppPath()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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

  // IPC: get setup status
  ipcMain.handle('get-setup-status', () => {
    return checkSetupStatus()
  })

  // IPC: save ASR provider choice
  ipcMain.handle('save-asr-provider', (_event, provider: string) => {
    saveAsrProvider(provider)
    return { success: true }
  })

  // IPC: reinstall backend (uv sync + restart)
  ipcMain.handle('reinstall-backend', async () => {
    try {
      stopPythonBackend()
      // Wait for process to die
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setupPythonEnv()
      const port = await startPythonBackend()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-started', { port })
      }
      return { success: true, port }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // IPC: run setup
  ipcMain.handle('run-setup', async () => {
    try {
      const electronRoot = getElectronRoot()

      ensureAppDirectory()
      setupPythonSource(electronRoot, is.dev)
      copyAudiotee(electronRoot)
      setupPythonEnv()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // IPC: start Python backend
  ipcMain.handle('start-backend', async () => {
    try {
      const port = await startPythonBackend()
      // Notify all renderer windows
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-started', { port })
      }
      return { success: true, port }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // IPC: get backend port
  ipcMain.handle('get-backend-port', () => {
    return getBackendPort()
  })

  createWindow()

  // Auto-start backend if setup is complete
  const status = checkSetupStatus()
  if (status.ready) {
    try {
      const port = await startPythonBackend()
      mainWindow?.webContents.send('backend-started', { port })
    } catch (err) {
      console.error('Failed to auto-start backend:', err)
    }
  }
})

app.on('will-quit', () => {
  stopPythonBackend()
})

app.on('window-all-closed', () => {
  app.quit()
})

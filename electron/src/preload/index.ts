import { contextBridge, ipcRenderer } from 'electron'

export interface SetupStatus {
  uvInstalled: boolean
  hfInstalled: boolean
  appDirExists: boolean
  pythonEnvReady: boolean
  audioteeReady: boolean
  modelsDownloaded: boolean
  asrProvider: string
  ready: boolean
}

const api = {
  getSetupStatus: (): Promise<SetupStatus> => ipcRenderer.invoke('get-setup-status'),
  saveAsrProvider: (provider: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('save-asr-provider', provider),
  reinstallBackend: (): Promise<{ success: boolean; port?: number; error?: string }> =>
    ipcRenderer.invoke('reinstall-backend'),
  runSetup: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('run-setup'),
  startBackend: (): Promise<{ success: boolean; port?: number; error?: string }> =>
    ipcRenderer.invoke('start-backend'),
  getBackendPort: (): Promise<number> => ipcRenderer.invoke('get-backend-port'),

  // Electron-only config
  getElectronConfig: (): Promise<{ overlay_position: string; overlay_enabled: boolean; overlay_click_through: boolean; launch_at_login: boolean }> =>
    ipcRenderer.invoke('get-electron-config'),
  setElectronConfig: (updates: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('set-electron-config', updates),

  // Overlay interaction mode
  setOverlayClickThrough: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('set-overlay-click-through', value),
  onOverlayModeChanged: (callback: (data: { clickThrough: boolean }) => void): void => {
    ipcRenderer.on('overlay-mode-changed', (_event, data) => callback(data))
  },

  // Events from main process
  onBackendStarted: (callback: (data: { port: number }) => void): void => {
    ipcRenderer.on('backend-started', (_event, data) => callback(data))
  },
  onPythonCrashed: (callback: (data: { code: number; signal: string }) => void): void => {
    ipcRenderer.on('python-crashed', (_event, data) => callback(data))
  },

  // Settings trigger from tray
  onOpenSettings: (callback: () => void): void => {
    ipcRenderer.on('open-settings', () => callback())
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}

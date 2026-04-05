import { contextBridge, ipcRenderer } from 'electron'

export interface SetupStatus {
  uvInstalled: boolean
  hfInstalled: boolean
  appDirExists: boolean
  pythonEnvReady: boolean
  audioteeReady: boolean
  modelsDownloaded: boolean
  ready: boolean
}

const api = {
  getSetupStatus: (): Promise<SetupStatus> => ipcRenderer.invoke('get-setup-status'),
  runSetup: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('run-setup'),
  startBackend: (): Promise<{ success: boolean; port?: number; error?: string }> =>
    ipcRenderer.invoke('start-backend'),
  getBackendPort: (): Promise<number> => ipcRenderer.invoke('get-backend-port'),

  // Events from main process
  onBackendStarted: (callback: (data: { port: number }) => void): void => {
    ipcRenderer.on('backend-started', (_event, data) => callback(data))
  },
  onPythonCrashed: (callback: (data: { code: number; signal: string }) => void): void => {
    ipcRenderer.on('python-crashed', (_event, data) => callback(data))
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}

import { Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let tray: Tray | null = null

function getTrayIcon(recording: boolean): nativeImage {
  const resourcesPath = is.dev
    ? join(__dirname, '..', '..', 'resources')
    : join(process.resourcesPath || '', '')

  const name = recording ? 'trayRecording' : 'trayIdleTemplate'
  const iconPath = join(resourcesPath, `${name}.png`)
  const icon = nativeImage.createFromPath(iconPath)

  // macOS template images auto-adapt to light/dark menu bar
  if (!recording) icon.setTemplateImage(true)

  return icon
}

export interface TrayCallbacks {
  onStartRecording: () => void
  onStopRecording: () => void
  onShowMainWindow: () => void
  onShowOverlay: () => void
  onToggleClickThrough: () => void
  onOpenSettings: () => void
  onQuit: () => void
}

let callbacks: TrayCallbacks | null = null
let isRecording = false
let isOverlayMode = false
let isClickThrough = false

export function createTray(cb: TrayCallbacks): void {
  callbacks = cb
  tray = new Tray(getTrayIcon(false))
  tray.setToolTip('Just Transcribe')
  rebuildMenu()
}

export function updateTrayState(recording: boolean, overlayMode: boolean, clickThrough: boolean): void {
  isRecording = recording
  isOverlayMode = overlayMode
  isClickThrough = clickThrough
  if (tray) {
    tray.setImage(getTrayIcon(recording))
    rebuildMenu()
  }
}

function rebuildMenu(): void {
  if (!tray || !callbacks) return

  const menu = Menu.buildFromTemplate([
    {
      label: isRecording ? 'Stop Recording' : 'Start Recording',
      click: () => isRecording ? callbacks!.onStopRecording() : callbacks!.onStartRecording()
    },
    {
      label: isOverlayMode ? 'Show Main Window' : 'Show Overlay',
      click: () => isOverlayMode ? callbacks!.onShowMainWindow() : callbacks!.onShowOverlay()
    },
    ...(isOverlayMode
      ? [{
          label: isClickThrough ? 'Unlock Overlay (Interactive)' : 'Lock Overlay (Click-Through)',
          click: (): void => callbacks!.onToggleClickThrough()
        }]
      : []),
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => callbacks!.onOpenSettings()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => callbacks!.onQuit()
    }
  ])

  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

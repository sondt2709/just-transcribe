// "Just Transcribe Microphone": install, update and remove the Audio Server Plug-in.
// Each action is one macOS administrator prompt; Core Audio restarts after it.

import { execFile } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  DRIVER_BUNDLE,
  INSTALLED_PATH,
  adminScript,
  bundleVersion,
  driverStatus,
  installCommand,
  isUserCancel,
  removeCommand,
  type DriverStatus
} from './driverCommands'

const CORE_AUDIO_RESTART_MS = 2500

export interface DriverActionResult {
  ok: boolean
  cancelled?: boolean
  error?: string
  status: DriverStatus
}

export function bundledDriverPath(electronRoot: string, dev: boolean): string {
  return dev
    ? join(electronRoot, 'resources', 'driver', DRIVER_BUNDLE)
    : join(process.resourcesPath || '', 'driver', DRIVER_BUNDLE)
}

function readVersion(bundlePath: string): string | null {
  const plist = join(bundlePath, 'Contents', 'Info.plist')
  if (!existsSync(plist)) return null
  try {
    return bundleVersion(readFileSync(plist, 'utf-8'))
  } catch {
    return null
  }
}

export function getDriverStatus(bundledPath: string): DriverStatus {
  return driverStatus(readVersion(INSTALLED_PATH), readVersion(bundledPath))
}

function runAdmin(command: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', adminScript(command)], (err, _stdout, stderr) => {
      if (!err) return resolve({ ok: true })
      if (isUserCancel(String(stderr))) return resolve({ ok: false, cancelled: true })
      resolve({ ok: false, error: String(stderr || err.message).trim() })
    })
  })
}

async function act(command: string, bundledPath: string): Promise<DriverActionResult> {
  const result = await runAdmin(command)
  // launchd restarts coreaudiod; give it time before anyone lists devices again
  if (result.ok) await new Promise((r) => setTimeout(r, CORE_AUDIO_RESTART_MS))
  return { ...result, status: getDriverStatus(bundledPath) }
}

export async function installDriver(bundledPath: string): Promise<DriverActionResult> {
  if (!existsSync(bundledPath)) {
    return { ok: false, error: 'The driver is not in this build', status: getDriverStatus(bundledPath) }
  }
  return act(installCommand(bundledPath), bundledPath)
}

export async function removeDriver(bundledPath: string): Promise<DriverActionResult> {
  return act(removeCommand(), bundledPath)
}

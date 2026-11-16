// Pure helpers for the "Just Transcribe Microphone" driver (no Electron imports: unit-tested).

export const DRIVER_BUNDLE = 'JustTranscribeMic.driver'
export const HAL_DIR = '/Library/Audio/Plug-Ins/HAL'
export const INSTALLED_PATH = `${HAL_DIR}/${DRIVER_BUNDLE}`

export type DriverState = 'not_installed' | 'installed' | 'update_available' | 'unavailable'

export interface DriverStatus {
  state: DriverState
  installed: string | null
  bundled: string | null
}

/** CFBundleVersion from an XML Info.plist, or null. */
export function bundleVersion(plistXml: string | null): string | null {
  if (!plistXml) return null
  const m = plistXml.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)
  return m ? m[1].trim() : null
}

export function driverStatus(installed: string | null, bundled: string | null): DriverStatus {
  let state: DriverState
  if (!bundled) state = 'unavailable' // dev build without scripts/build-driver.sh
  else if (!installed) state = 'not_installed'
  else state = installed === bundled ? 'installed' : 'update_available'
  return { state, installed, bundled }
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Shell command run as root through one macOS administrator prompt. */
export function installCommand(bundledPath: string): string {
  const dst = shQuote(INSTALLED_PATH)
  return [
    `mkdir -p ${shQuote(HAL_DIR)}`,
    `rm -rf ${dst}`,
    `cp -R ${shQuote(bundledPath)} ${shQuote(HAL_DIR + '/')}`,
    `chown -R root:wheel ${dst}`,
    `(xattr -dr com.apple.quarantine ${dst} || true)`,
    'killall coreaudiod'
  ].join(' && ')
}

export function removeCommand(): string {
  return `rm -rf ${shQuote(INSTALLED_PATH)} && killall coreaudiod`
}

/** AppleScript for `osascript -e`: escape for an AppleScript string literal. */
export function adminScript(command: string): string {
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `do shell script "${escaped}" with administrator privileges`
}

/** osascript error when the user clicks Cancel in the password prompt. */
export function isUserCancel(stderr: string): boolean {
  return /\(-128\)|User canceled/i.test(stderr)
}

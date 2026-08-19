import { execSync, execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const APP_DIR = path.join(os.homedir(), '.just-transcribe')
const BIN_DIR = path.join(APP_DIR, 'bin')
const CONFIG_FILE = path.join(APP_DIR, 'config.toml')
const HF_CACHE = path.join(os.homedir(), '.cache', 'huggingface', 'hub')

// In dev mode, use python/ source dir directly (no copy)
// In prod mode, use ~/.just-transcribe/python/ (copied from app bundle)
let PYTHON_DIR = path.join(APP_DIR, 'python')

// Resolve the user's full shell PATH (Finder-launched apps get a minimal PATH)
let resolvedEnv: Record<string, string> | undefined

export function getShellEnv(): Record<string, string> {
  if (resolvedEnv) return resolvedEnv

  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const output = execSync(`${shell} -ilc 'echo "___PATH___$PATH___PATH___"'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    })
    const match = output.match(/___PATH___(.+)___PATH___/)
    if (match) {
      resolvedEnv = { ...process.env, PATH: match[1] } as Record<string, string>
      return resolvedEnv
    }
  } catch {
    // Fall back to common paths
  }

  // Fallback: augment with common tool locations
  const home = os.homedir()
  const extraPaths = [
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin'
  ]
  const currentPath = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'
  resolvedEnv = { ...process.env, PATH: `${extraPaths.join(':')}:${currentPath}` } as Record<string, string>
  return resolvedEnv
}

export function getPythonDir(): string {
  return PYTHON_DIR
}

export function setPythonDir(dir: string): void {
  PYTHON_DIR = dir
}

export interface SetupStatus {
  uvInstalled: boolean
  hfInstalled: boolean
  appDirExists: boolean
  pythonEnvReady: boolean
  audioteeReady: boolean
  modelsDownloaded: boolean
  asrProvider: string // "local" | "remote" | "" (not yet chosen)
  ready: boolean
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore', env: getShellEnv() })
    return true
  } catch {
    return false
  }
}

function modelCached(modelId: string): boolean {
  // HuggingFace cache stores models as models--org--name
  const dirName = `models--${modelId.replace('/', '--')}`
  const modelDir = path.join(HF_CACHE, dirName)
  return fs.existsSync(modelDir)
}

function readAsrProvider(): string {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return ''
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const match = content.match(/asr_provider\s*=\s*"([^"]*)"/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

// ── Electron-only config fields (overlay, tray, launch-at-login) ──

export interface ElectronConfig {
  overlay_position: string
  overlay_enabled: boolean
  launch_at_login: boolean
}

const ELECTRON_CONFIG_DEFAULTS: ElectronConfig = {
  overlay_position: 'bottom-center',
  overlay_enabled: false,
  launch_at_login: false
}

const VALID_POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

export function readElectronConfig(): ElectronConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { ...ELECTRON_CONFIG_DEFAULTS }
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')

    const posMatch = content.match(/overlay_position\s*=\s*"([^"]*)"/)
    const enabledMatch = content.match(/overlay_enabled\s*=\s*(true|false)/)
    const loginMatch = content.match(/launch_at_login\s*=\s*(true|false)/)

    const position = posMatch?.[1] ?? ''
    return {
      overlay_position: VALID_POSITIONS.includes(position) ? position : ELECTRON_CONFIG_DEFAULTS.overlay_position,
      overlay_enabled: enabledMatch ? enabledMatch[1] === 'true' : ELECTRON_CONFIG_DEFAULTS.overlay_enabled,
      launch_at_login: loginMatch ? loginMatch[1] === 'true' : ELECTRON_CONFIG_DEFAULTS.launch_at_login
    }
  } catch {
    return { ...ELECTRON_CONFIG_DEFAULTS }
  }
}

export function writeElectronConfig(updates: Partial<ElectronConfig>): void {
  fs.mkdirSync(APP_DIR, { recursive: true })
  let content = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf-8') : ''

  for (const [key, value] of Object.entries(updates)) {
    const strValue = typeof value === 'boolean' ? String(value) : `"${value}"`
    const regex = new RegExp(`${key}\\s*=\\s*(?:"[^"]*"|true|false)`)
    if (regex.test(content)) {
      content = content.replace(regex, `${key} = ${strValue}`)
    } else {
      content += `\n${key} = ${strValue}\n`
    }
  }

  fs.writeFileSync(CONFIG_FILE, content, 'utf-8')
}

export function saveAsrProvider(provider: string): void {
  fs.mkdirSync(APP_DIR, { recursive: true })
  if (fs.existsSync(CONFIG_FILE)) {
    let content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    if (content.includes('asr_provider')) {
      content = content.replace(/asr_provider\s*=\s*"[^"]*"/, `asr_provider = "${provider}"`)
    } else {
      content += `\nasr_provider = "${provider}"\n`
    }
    fs.writeFileSync(CONFIG_FILE, content, 'utf-8')
  } else {
    fs.writeFileSync(CONFIG_FILE, `asr_provider = "${provider}"\n`, 'utf-8')
  }
}

export function checkSetupStatus(): SetupStatus {
  const uvInstalled = commandExists('uv')
  const hfInstalled = commandExists('hf') || commandExists('huggingface-cli')
  const appDirExists = fs.existsSync(APP_DIR)
  const pythonEnvReady = fs.existsSync(path.join(PYTHON_DIR, '.venv'))
  const audioteeReady = fs.existsSync(path.join(BIN_DIR, 'audiotee'))
  const modelsDownloaded = modelCached('Qwen/Qwen3-ASR-1.7B')
  const asrProvider = readAsrProvider()

  // Ready condition depends on provider choice
  let ready: boolean
  if (asrProvider === 'remote') {
    // Remote: no need for hf or local model
    ready = uvInstalled && pythonEnvReady && audioteeReady
  } else if (asrProvider === 'local') {
    ready = uvInstalled && pythonEnvReady && audioteeReady && modelsDownloaded
  } else {
    // No provider chosen yet — not ready
    ready = false
  }

  return {
    uvInstalled,
    hfInstalled,
    appDirExists,
    pythonEnvReady,
    audioteeReady,
    modelsDownloaded,
    asrProvider,
    ready
  }
}

// ── Backend version marker ──
// Written after a successful source copy + uv sync; a mismatch with the
// running app version means the installed backend is stale and must be
// refreshed. Lives inside python/ so wiping that dir also resets it.

function versionMarkerPath(): string {
  return path.join(PYTHON_DIR, '.app-version')
}

export function readBackendVersion(): string {
  try {
    return fs.readFileSync(versionMarkerPath(), 'utf-8').trim()
  } catch {
    return ''
  }
}

export function writeBackendVersion(version: string): void {
  fs.mkdirSync(PYTHON_DIR, { recursive: true })
  fs.writeFileSync(versionMarkerPath(), version, 'utf-8')
}

export function backendNeedsRefresh(appVersion: string, isDev: boolean): boolean {
  if (isDev) return false
  return readBackendVersion() !== appVersion
}

export function ensureAppDirectory(): void {
  for (const dir of [APP_DIR, BIN_DIR, path.join(APP_DIR, 'logs')]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function setupPythonSource(electronRoot: string, isDev: boolean): void {
  if (isDev) {
    // In dev mode, point directly to the source python/ directory — no copying
    const devSource = path.resolve(electronRoot, '..', 'python')
    if (!fs.existsSync(devSource)) {
      throw new Error(`Python source not found at ${devSource}`)
    }
    PYTHON_DIR = devSource
  } else {
    // In prod, copy from app bundle to ~/.just-transcribe/python/
    const prodSource = path.join(process.resourcesPath || '', 'python')
    if (!fs.existsSync(prodSource)) {
      throw new Error(`Python source not found in app bundle at ${prodSource}`)
    }
    // Only copy source files, exclude .venv and __pycache__
    fs.mkdirSync(PYTHON_DIR, { recursive: true })
    fs.cpSync(prodSource, PYTHON_DIR, {
      recursive: true,
      force: true,
      filter: (src) => {
        const base = path.basename(src)
        return base !== '.venv' && base !== '__pycache__' && base !== 'uv.lock'
      }
    })
  }
}

export function copyAudiotee(electronRoot: string): void {
  const devSource = path.resolve(electronRoot, 'resources', 'bin', 'audiotee')
  const prodSource = path.join(process.resourcesPath || '', 'bin', 'audiotee')
  const source = fs.existsSync(devSource) ? devSource : prodSource
  const dest = path.join(BIN_DIR, 'audiotee')

  if (!fs.existsSync(source)) {
    throw new Error(`audiotee binary not found at ${devSource} or ${prodSource}`)
  }

  // Skip if already there and same file
  if (fs.existsSync(dest)) {
    const srcStat = fs.statSync(source)
    const dstStat = fs.statSync(dest)
    if (srcStat.size === dstStat.size) {
      fs.chmodSync(dest, 0o755)
      return
    }
  }

  fs.copyFileSync(source, dest)
  fs.chmodSync(dest, 0o755)
}

export function setupPythonEnv(): void {
  execFileSync('uv', ['sync'], {
    cwd: getPythonDir(),
    stdio: 'inherit',
    timeout: 300000, // 5 minutes
    env: getShellEnv()
  })
}

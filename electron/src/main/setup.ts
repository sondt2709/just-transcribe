import { execSync, execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const APP_DIR = path.join(os.homedir(), '.just-transcribe')
const BIN_DIR = path.join(APP_DIR, 'bin')
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

export function checkSetupStatus(): SetupStatus {
  const uvInstalled = commandExists('uv')
  const hfInstalled = commandExists('hf') || commandExists('huggingface-cli')
  const appDirExists = fs.existsSync(APP_DIR)
  const pythonEnvReady = fs.existsSync(path.join(PYTHON_DIR, '.venv'))
  const audioteeReady = fs.existsSync(path.join(BIN_DIR, 'audiotee'))
  const modelsDownloaded = modelCached('Qwen/Qwen3-ASR-1.7B')

  return {
    uvInstalled,
    hfInstalled,
    appDirExists,
    pythonEnvReady,
    audioteeReady,
    modelsDownloaded,
    ready: uvInstalled && hfInstalled && pythonEnvReady && audioteeReady && modelsDownloaded
  }
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

import { ChildProcess, spawn } from 'child_process'
import { app, BrowserWindow } from 'electron'
import net from 'net'
import path from 'path'
import os from 'os'
import { getPythonDir, getShellEnv } from './setup'

let pythonProcess: ChildProcess | null = null
let backendPort = 0

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Could not find free port')))
      }
    })
    server.on('error', reject)
  })
}

export function getBackendPort(): number {
  return backendPort
}

export async function startPythonBackend(): Promise<number> {
  backendPort = await findFreePort()

  const appDir = path.join(os.homedir(), '.just-transcribe')
  const auditeePath = path.join(appDir, 'bin', 'audiotee')
  const pythonDir = getPythonDir()

  pythonProcess = spawn(
    'uv',
    ['run', 'python', '-m', 'just_transcribe', '--port', String(backendPort), '--audiotee', auditeePath],
    {
      cwd: pythonDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...getShellEnv(), PYTHONUNBUFFERED: '1' }
    }
  )

  // Wait for READY signal from Python
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Python backend startup timed out (60s)'))
    }, 60000)

    const onData = (data: Buffer): void => {
      const text = data.toString()
      if (text.includes('READY')) {
        clearTimeout(timeout)
        pythonProcess?.stdout?.removeListener('data', onData)
        console.log(`Python backend ready on port ${backendPort}`)
        resolve(backendPort)
      }
    }

    pythonProcess!.stdout?.on('data', onData)

    pythonProcess!.stderr?.on('data', (data: Buffer) => {
      console.error(`[python] ${data.toString().trim()}`)
    })

    pythonProcess!.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start Python backend: ${err.message}`))
    })

    pythonProcess!.on('exit', (code, signal) => {
      console.log(`Python backend exited (code=${code}, signal=${signal})`)
      pythonProcess = null

      // Notify renderer of crash if app is still running
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        win.webContents.send('python-crashed', { code, signal })
      }
    })
  })
}

export function stopPythonBackend(): void {
  if (pythonProcess) {
    // Close stdin (triggers EOF detection in Python)
    pythonProcess.stdin?.end()
    pythonProcess.kill('SIGTERM')

    // Force kill after 3 seconds if still alive
    const forceKill = setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGKILL')
        pythonProcess = null
      }
    }, 3000)

    pythonProcess.on('exit', () => {
      clearTimeout(forceKill)
      pythonProcess = null
    })
  }
}

export function isPythonRunning(): boolean {
  return pythonProcess !== null && !pythonProcess.killed
}

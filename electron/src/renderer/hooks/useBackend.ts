import { useState, useEffect, useCallback, useRef } from 'react'

interface BackendStatus {
  recording: boolean
  model_loaded: boolean
  mic_active: boolean
  speaker_active: boolean
}

interface UseBackendReturn {
  port: number | null
  status: BackendStatus | null
  recording: boolean
  startRecording: (mic?: boolean, speaker?: boolean) => Promise<void>
  stopRecording: () => Promise<void>
  connected: boolean
}

export function useBackend(): UseBackendReturn {
  const [port, setPort] = useState<number | null>(null)
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen for backend start from main process
  useEffect(() => {
    window.api.getBackendPort().then((p) => {
      if (p > 0) setPort(p)
    })

    window.api.onBackendStarted(({ port: p }) => {
      setPort(p)
    })

    window.api.onPythonCrashed(() => {
      setPort(null)
      setConnected(false)
      setStatus(null)
    })

    // Re-check port periodically in case event was missed (e.g., after setup)
    const check = setInterval(() => {
      window.api.getBackendPort().then((p) => {
        if (p > 0) setPort((prev) => prev || p)
      })
    }, 2000)
    return () => clearInterval(check)
  }, [])

  // Poll status
  useEffect(() => {
    if (!port) return

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/status`)
        if (res.ok) {
          const data = await res.json()
          setStatus(data)
          setConnected(true)
        }
      } catch {
        setConnected(false)
      }
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [port])

  const startRecording = useCallback(
    async (mic = true, speaker = true) => {
      if (!port) return
      try {
        await fetch(`http://127.0.0.1:${port}/api/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mic, speaker })
        })
      } catch (err) {
        console.error('Failed to start recording:', err)
      }
    },
    [port]
  )

  const stopRecording = useCallback(async () => {
    if (!port) return
    try {
      await fetch(`http://127.0.0.1:${port}/api/stop`, { method: 'POST' })
    } catch (err) {
      console.error('Failed to stop recording:', err)
    }
  }, [port])

  return {
    port,
    status,
    recording: status?.recording ?? false,
    startRecording,
    stopRecording,
    connected
  }
}

import { useState, useEffect, useCallback } from 'react'

export interface SessionMeta {
  name: string
  event_count: number
  duration_s: number
  stalls: number
  errors: number
  wav_count: number
  size_bytes: number
}

export interface TraceEvent {
  ts: number
  event: string
  trace_id?: string
  [key: string]: unknown
}

interface UseSessionsReturn {
  sessions: SessionMeta[]
  loading: boolean
  error: string | null
  refresh: () => void
  fetchEvents: (name: string) => Promise<TraceEvent[]>
}

export function useSessions(port: number | null): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!port) return
    setLoading(true)
    setError(null)
    fetch(`http://127.0.0.1:${port}/api/sessions`)
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions || []))
      .catch(() => setError('Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [port])

  useEffect(() => {
    refresh()
  }, [refresh])

  const fetchEvents = useCallback(
    async (name: string): Promise<TraceEvent[]> => {
      if (!port) return []
      const r = await fetch(`http://127.0.0.1:${port}/api/sessions/${name}/events`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      return data.events || []
    },
    [port]
  )

  return { sessions, loading, error, refresh, fetchEvents }
}

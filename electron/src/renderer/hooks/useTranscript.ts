import { useState, useEffect, useRef, useCallback } from 'react'

export interface Segment {
  id: number
  text: string
  source: string
  speaker: string
  lang: string
  start: number
  end: number
  translation?: string
  translationLang?: string
}

interface InterimState {
  text: string
  source: string
}

interface UseTranscriptReturn {
  segments: Segment[]
  interim: InterimState | null
  connected: boolean
}

export function useTranscript(port: number | null): UseTranscriptReturn {
  const [segments, setSegments] = useState<Segment[]>([])
  const [interim, setInterim] = useState<InterimState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!port) return

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/transcript`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      console.log('WebSocket connected')
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Auto-reconnect after 2 seconds
      reconnectRef.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        switch (data.type) {
          case 'segment':
            setSegments((prev) => [
              ...prev,
              {
                id: data.id,
                text: data.text,
                source: data.source,
                speaker: data.speaker,
                lang: data.lang,
                start: data.start,
                end: data.end
              }
            ])
            setInterim(null)
            break

          case 'interim':
            setInterim({ text: data.text, source: data.source })
            break

          case 'translate':
            setSegments((prev) =>
              prev.map((seg) =>
                seg.id === data.id
                  ? { ...seg, translation: data.text, translationLang: data.target_lang }
                  : seg
              )
            )
            break

          case 'error':
            console.error('Backend error:', data.message)
            break
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }
  }, [port])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { segments, interim, connected }
}

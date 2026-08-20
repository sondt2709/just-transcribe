import { useState, useMemo, useCallback } from 'react'
import { useSessions, SessionMeta, TraceEvent } from '../hooks/useSessions'

interface TraceViewerProps {
  port: number | null
  onClose: () => void
}

// Event-type chip colors by family
function chipClass(event: string): string {
  if (event === 'stall' || event.endsWith('_error')) return 'bg-red-500/20 text-red-300'
  if (event.startsWith('vad_')) return 'bg-teal-500/20 text-teal-300'
  if (event.startsWith('asr_')) return 'bg-blue-500/20 text-blue-300'
  if (event.startsWith('translate_')) return 'bg-purple-500/20 text-purple-300'
  if (event === 'mic_gated' || event === 'dedup_drop' || event === 'segment_dropped')
    return 'bg-amber-500/20 text-amber-300'
  if (event === 'heartbeat') return 'bg-neutral-700/50 text-neutral-400'
  return 'bg-neutral-700 text-neutral-300'
}

// One-line summary of an event's most useful fields
function summarize(e: TraceEvent): string {
  const parts: string[] = []
  if (e.source) parts.push(String(e.source))
  if (e.kind) parts.push(String(e.kind))
  if (typeof e.latency_s === 'number') parts.push(`${e.latency_s}s`)
  if (typeof e.similarity === 'number') parts.push(`sim=${e.similarity}`)
  if (e.status) parts.push(String(e.status))
  if (e.target_lang) parts.push(`→${e.target_lang}`)
  if (e.reason) parts.push(String(e.reason))
  if (e.stage) parts.push(`stage=${e.stage}`)
  const text = e.text ?? e.message ?? e.error
  if (text) parts.push(`"${String(text).slice(0, 60)}"`)
  return parts.join(' · ')
}

function fmtTime(ts: number, t0: number): string {
  return `+${(ts - t0).toFixed(1)}s`
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

interface TranscriptRow {
  ts: number
  traceId: string
  source: string
  lang: string
  text: string
  wav?: string
  translations: { lang: string; text: string }[]
  deduped: boolean
}

// Reconstruct the conversation from final ASR events, pairing each final
// asr_done with the wav recorded on its asr_call and any translations/dedup
// verdicts that follow (matched by trace_id in stream order).
function buildTranscript(events: TraceEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = []
  const pendingWav: Record<string, string> = {}
  const lastRowByTrace: Record<string, TranscriptRow> = {}
  for (const e of events) {
    const tid = String(e.trace_id ?? '')
    if (e.event === 'asr_call' && e.kind === 'final' && typeof e.wav === 'string') {
      pendingWav[tid] = e.wav
    } else if (e.event === 'asr_done' && e.kind === 'final' && e.text) {
      const row: TranscriptRow = {
        ts: e.ts,
        traceId: tid,
        source: String(e.source ?? ''),
        lang: String(e.lang ?? ''),
        text: String(e.text),
        wav: pendingWav[tid],
        translations: [],
        deduped: false
      }
      delete pendingWav[tid]
      rows.push(row)
      lastRowByTrace[tid] = row
    } else if (e.event === 'dedup_drop') {
      const row = lastRowByTrace[tid]
      if (row) row.deduped = true
    } else if (e.event === 'translate_done' && e.status === 'ok' && e.text) {
      const row = lastRowByTrace[tid]
      if (row) row.translations.push({ lang: String(e.target_lang ?? ''), text: String(e.text) })
    }
  }
  return rows
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

export function TraceViewer({ port, onClose }: TraceViewerProps): JSX.Element {
  const { sessions, loading, error, refresh, fetchEvents } = useSessions(port)
  const [selected, setSelected] = useState<string | null>(null)
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [showHeartbeats, setShowHeartbeats] = useState(false)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [view, setView] = useState<'events' | 'transcript'>('events')

  const loadSession = useCallback(
    (name: string) => {
      setSelected(name)
      setEvents([])
      setEventsError(null)
      setExpanded(new Set())
      setTypeFilter(new Set())
      fetchEvents(name)
        .then(setEvents)
        .catch(() => setEventsError('Failed to load events'))
    },
    [fetchEvents]
  )

  const eventTypes = useMemo(
    () => [...new Set(events.map((e) => e.event))].sort(),
    [events]
  )

  const t0 = events.length ? events[0].ts : 0

  const transcript = useMemo(() => buildTranscript(events), [events])

  const summary = useMemo(() => {
    const asrLat = events
      .filter((e) => e.event === 'asr_done' && typeof e.latency_s === 'number')
      .map((e) => e.latency_s as number)
    const tl = events.filter((e) => e.event === 'translate_done')
    return {
      total: events.length,
      asrCalls: asrLat.length,
      asrP50: percentile(asrLat, 0.5).toFixed(2),
      asrMax: asrLat.length ? Math.max(...asrLat).toFixed(2) : '0',
      translateOk: tl.filter((e) => e.status === 'ok').length,
      translateErr: tl.filter((e) => e.status !== 'ok').length,
      stalls: events.filter((e) => e.event === 'stall').length
    }
  }, [events])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => {
        if (!showHeartbeats && e.event === 'heartbeat') return false
        if (typeFilter.size > 0 && !typeFilter.has(e.event)) return false
        if (q && !JSON.stringify(e).toLowerCase().includes(q)) return false
        return true
      })
  }, [events, showHeartbeats, typeFilter, search])

  const toggleType = (t: string): void => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const toggleExpand = (i: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // Collect wav paths from an event: `wav` field + stall `ring_dumps`
  const wavPaths = (e: TraceEvent): string[] => {
    const paths: string[] = []
    if (typeof e.wav === 'string') paths.push(e.wav)
    if (Array.isArray(e.ring_dumps)) {
      for (const p of e.ring_dumps) if (typeof p === 'string') paths.push(p)
    }
    return paths
  }

  const audioUrl = (path: string): string =>
    `http://127.0.0.1:${port}/api/sessions/${selected}/audio/${path.replace(/^segments\//, '')}`

  return (
    <div className="fixed inset-0 bg-neutral-950 z-[60] flex flex-col no-drag select-text">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 shrink-0">
        <h2 className="text-lg font-semibold text-neutral-100">Debug Sessions</h2>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 text-neutral-200 text-sm rounded-lg hover:bg-neutral-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Session list */}
        <div className="w-64 border-r border-neutral-800 overflow-y-auto shrink-0">
          {loading && <p className="text-xs text-neutral-500 p-4">Loading...</p>}
          {error && <p className="text-xs text-red-400 p-4">{error}</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-xs text-neutral-500 p-4">No sessions yet — start a recording.</p>
          )}
          {sessions.map((s: SessionMeta) => (
            <button
              key={s.name}
              onClick={() => loadSession(s.name)}
              className={`w-full text-left px-4 py-3 border-b border-neutral-900 hover:bg-neutral-900 transition-colors ${
                selected === s.name ? 'bg-neutral-900' : ''
              }`}
            >
              <div className="text-sm text-neutral-200 font-mono">{s.name}</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {s.event_count} events · {Math.round(s.duration_s)}s · {fmtSize(s.size_bytes)}
                {s.wav_count > 0 && ` · ${s.wav_count} wav`}
              </div>
              <div className="flex gap-1.5 mt-1">
                {s.stalls > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    {s.stalls} stall{s.stalls > 1 ? 's' : ''}
                  </span>
                )}
                {s.errors > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                    {s.errors} error{s.errors > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Event view */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-600">
              Select a session
            </div>
          ) : (
            <>
              {/* Summary + filters */}
              <div className="px-4 py-3 border-b border-neutral-800 shrink-0 space-y-2">
                {eventsError && <p className="text-xs text-red-400">{eventsError}</p>}
                <div className="text-xs text-neutral-400">
                  {summary.total} events · ASR {summary.asrCalls} calls (p50 {summary.asrP50}s,
                  max {summary.asrMax}s) · translate {summary.translateOk} ok
                  {summary.translateErr > 0 && (
                    <span className="text-red-300"> / {summary.translateErr} err</span>
                  )}
                  {summary.stalls > 0 && (
                    <span className="text-amber-300"> · {summary.stalls} stall(s)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                    {(['events', 'transcript'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-3 py-1 text-xs capitalize transition-colors ${
                          view === v
                            ? 'bg-teal-500/20 text-teal-300'
                            : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {view === 'events' && (
                    <>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-teal-500 w-48"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <input
                      type="checkbox"
                      checked={showHeartbeats}
                      onChange={(e) => setShowHeartbeats(e.target.checked)}
                      className="rounded"
                    />
                    Heartbeats
                  </label>
                  {eventTypes
                    .filter((t) => t !== 'heartbeat')
                    .map((t) => (
                      <button
                        key={t}
                        onClick={() => toggleType(t)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-opacity ${chipClass(t)} ${
                          typeFilter.size > 0 && !typeFilter.has(t) ? 'opacity-30' : ''
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                    </>
                  )}
                </div>
              </div>

              {/* Transcript view */}
              {view === 'transcript' && (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {transcript.map((row, i) => (
                    <div key={i} className={row.deduped ? 'opacity-50' : ''}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-neutral-600 font-mono">{fmtTime(row.ts, t0)}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            row.source === 'mic'
                              ? 'bg-teal-500/20 text-teal-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {row.source === 'mic' ? 'You' : 'Others'}
                        </span>
                        {row.lang && (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500">
                            {row.lang}
                          </span>
                        )}
                        {row.deduped && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            dedup
                          </span>
                        )}
                        {row.wav && (
                          <audio
                            controls
                            preload="none"
                            src={audioUrl(row.wav)}
                            className="h-7 ml-auto"
                          />
                        )}
                      </div>
                      <p
                        className={`text-sm text-neutral-200 mt-1 ${
                          row.deduped ? 'line-through' : ''
                        }`}
                      >
                        {row.text}
                      </p>
                      {row.translations.map((tr) => (
                        <p key={tr.lang} className="text-sm text-purple-300/90 mt-0.5 pl-4">
                          <span className="text-[10px] text-purple-400/60 mr-1.5 uppercase">
                            {tr.lang}
                          </span>
                          {tr.text}
                        </p>
                      ))}
                    </div>
                  ))}
                  {transcript.length === 0 && (
                    <p className="text-xs text-neutral-600">No final segments in this session.</p>
                  )}
                </div>
              )}

              {/* Event table */}
              {view === 'events' && (
              <div className="flex-1 overflow-y-auto font-mono text-xs">
                {visible.map(({ e, i }) => (
                  <div key={i} className="border-b border-neutral-900">
                    <button
                      onClick={() => toggleExpand(i)}
                      className="w-full text-left px-4 py-1.5 flex items-center gap-3 hover:bg-neutral-900 transition-colors"
                    >
                      <span className="text-neutral-600 w-16 shrink-0">{fmtTime(e.ts, t0)}</span>
                      <span className={`px-1.5 py-0.5 rounded shrink-0 ${chipClass(e.event)}`}>
                        {e.event}
                      </span>
                      {e.trace_id ? (
                        <span className="text-neutral-600 shrink-0">{String(e.trace_id)}</span>
                      ) : null}
                      <span className="text-neutral-400 truncate">{summarize(e)}</span>
                    </button>
                    {expanded.has(i) && (
                      <div className="px-4 pb-3 bg-neutral-900/50">
                        <pre className="text-[11px] text-neutral-300 whitespace-pre-wrap break-all bg-neutral-900 border border-neutral-800 rounded p-3 mt-1">
                          {JSON.stringify(e, null, 2)}
                        </pre>
                        {wavPaths(e).map((p) => (
                          <div key={p} className="mt-2 flex items-center gap-2">
                            <span className="text-neutral-500">{p}</span>
                            <audio controls preload="none" src={audioUrl(p)} className="h-8" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {visible.length === 0 && (
                  <p className="text-neutral-600 p-4">No events match filters.</p>
                )}
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

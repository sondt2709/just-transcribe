import { useEffect, useRef, useState } from 'react'
import type { SummaryState } from '../hooks/useTranscript'
import { ITEM_LABELS, formatSummaryMarkdown, type SummaryItemType } from '../lib/exportFormat'
import { exportSummary } from '../lib/transcriptActions'
import { speakText } from '../lib/speak'

interface SummaryPanelProps {
  port: number | null
  summary: SummaryState
  context: string
  /** Changes whenever settings may have changed (re-reads the trigger mode). */
  configVersion: number
}

const TYPE_STYLES: Record<SummaryItemType, string> = {
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  action: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  question: 'bg-violet-500/15 text-violet-300 border-violet-500/25'
}

function duration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`
}

function autoRule(debounce: number, maxWait: number): string {
  return maxWait > 0 ? `${debounce}s pause or ${duration(maxWait)}` : `${debounce}s after pause`
}

function clock(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function SummaryPanel({ port, summary, context, configVersion }: SummaryPanelProps): JSX.Element {
  const [mode, setMode] = useState<{ auto: boolean; debounce: number; maxWait: number }>({
    auto: true,
    debounce: 10,
    maxWait: 60
  })
  const [ctx, setCtx] = useState(context)
  const [showContext, setShowContext] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Backend context wins when it changes from elsewhere (other window, reconnect)
  useEffect(() => setCtx(context), [context])

  useEffect(() => {
    if (!port) return
    fetch(`http://127.0.0.1:${port}/api/config`)
      .then((r) => r.json())
      .then((cfg) =>
        setMode({
          auto: cfg.summary_mode !== 'manual',
          debounce: cfg.summary_debounce_s ?? 10,
          maxWait: cfg.summary_max_wait_s ?? 60
        })
      )
      .catch(() => {})
  }, [port, configVersion])

  const pushContext = (text: string, immediate = false): void => {
    setCtx(text)
    if (!port) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const send = (): void => {
      fetch(`http://127.0.0.1:${port}/api/summary/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      }).catch(console.error)
    }
    if (immediate) send()
    else saveTimer.current = setTimeout(send, 400)
  }

  const loadFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    pushContext(text.slice(0, 20000), true)
    setShowContext(true)
  }

  const runNow = async (): Promise<void> => {
    if (!port) return
    setRequesting(true)
    try {
      await fetch(`http://127.0.0.1:${port}/api/summary/run`, { method: 'POST' })
    } catch (err) {
      console.error('Summary run failed:', err)
    } finally {
      setRequesting(false)
    }
  }

  const flash = (key: string): void => {
    setCopied(key)
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500)
  }

  const copy = async (key: string, text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    flash(key)
  }

  const s = summary.summary
  const running = summary.status === 'running' || requesting

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-200">AI Summary</h2>
          <span className="text-[10px] text-neutral-500">
            {mode.auto ? `Auto · ${autoRule(mode.debounce, mode.maxWait)}` : 'Manual'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] min-h-4">
          {running ? (
            <span className="flex items-center gap-1.5 text-teal-400">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              Summarizing…
            </span>
          ) : summary.status === 'error' ? (
            <span className="text-red-400 truncate" title={summary.error}>
              Error: {summary.error}
            </span>
          ) : summary.updated_at ? (
            <span className="text-neutral-500">Updated {clock(summary.updated_at)}</span>
          ) : (
            <span className="text-neutral-600">Not summarized yet</span>
          )}
        </div>
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={runNow}
            disabled={!port || running}
            className="flex-1 px-2 py-1.5 text-xs rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 hover:bg-teal-500/30 disabled:opacity-50 transition-colors"
          >
            {running ? 'Summarizing…' : 'Summarize now'}
          </button>
          <button
            onClick={() => s && copy('all', formatSummaryMarkdown(s, summary.updated_at))}
            disabled={!s}
            className="px-2 py-1.5 text-xs rounded bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700 disabled:opacity-40 transition-colors"
          >
            {copied === 'all' ? 'Copied ✓' : 'Copy'}
          </button>
          <button
            onClick={() => s && exportSummary(s, summary.updated_at).catch(console.error)}
            disabled={!s}
            className="px-2 py-1.5 text-xs rounded bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700 disabled:opacity-40 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Context */}
      <div className="px-4 py-2 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowContext(!showContext)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200"
          >
            <span className={`text-[9px] transition-transform ${showContext ? 'rotate-90' : ''}`}>&#9654;</span>
            Session context
            {ctx && <span className="text-[10px] text-teal-500">· {ctx.length.toLocaleString()} chars</span>}
          </button>
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="text-[11px] text-neutral-500 hover:text-neutral-200">
              Load .txt/.md
            </button>
            {ctx && (
              <button onClick={() => pushContext('', true)} className="text-[11px] text-neutral-500 hover:text-red-400">
                Clear
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden" onChange={loadFile} />
        </div>
        {showContext && (
          <>
            <textarea
              value={ctx}
              onChange={(e) => pushContext(e.target.value)}
              placeholder="Agenda, names, goals… Used in every summary of this session. Not saved to disk."
              rows={5}
              maxLength={20000}
              className="mt-2 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-teal-500 resize-y"
            />
            <p className="text-[10px] text-neutral-600 mt-1">Kept in memory for this session only.</p>
          </>
        )}
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 select-text">
        {!s && (
          <p className="text-xs text-neutral-600 leading-relaxed">
            {mode.auto
              ? `The summary updates ${mode.debounce} seconds after the conversation pauses${
                  mode.maxWait > 0 ? `, or every ${duration(mode.maxWait)} while people keep talking` : ''
                }. Click "Summarize now" for an update at once.`
              : 'Click "Summarize now" to summarize the transcript.'}
            {summary.error === 'LLM not configured' && ' Set up Translation (LLM) in Settings first.'}
          </p>
        )}

        {s && (
          <>
            <Block title="Summary">
              <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">{s.summary || '—'}</p>
            </Block>

            <Block title="Items" count={s.items.length}>
              {s.items.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-2.5">
                  {s.items.map((it, i) => (
                    <li key={i}>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-px rounded border text-[10px] font-medium ${TYPE_STYLES[it.type]}`}>
                          {ITEM_LABELS[it.type]}
                        </span>
                        <span
                          className={`px-1.5 py-px rounded text-[10px] ${
                            it.speaker === 'You' ? 'bg-teal-500/20 text-teal-400' : 'bg-neutral-700/50 text-neutral-400'
                          }`}
                        >
                          {it.speaker}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-neutral-200 leading-snug">{it.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="Next actions" count={s.next_actions.length}>
              {s.next_actions.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-1">
                  {s.next_actions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-neutral-200 leading-snug">
                      <span className="text-teal-500 shrink-0">→</span>
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="Suggested answers" count={s.suggested_answers.length}>
              {s.suggested_answers.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-2">
                  {s.suggested_answers.map((a, i) => (
                    <div key={i} className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-3 py-2">
                      {a.for && <p className="text-[11px] text-neutral-500 mb-1">Re: {a.for}</p>}
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-[13px] text-indigo-100 leading-snug">{a.answer}</p>
                        <button
                          onClick={() => port && speakText(port, a.answer).catch(console.error)}
                          className="text-[11px] text-indigo-300/70 hover:text-indigo-200 shrink-0"
                          title="Translate and speak this answer"
                        >
                          🔊
                        </button>
                        <button
                          onClick={() => copy(`a${i}`, a.answer)}
                          className="text-[10px] text-indigo-300/70 hover:text-indigo-200 shrink-0"
                          title="Copy answer"
                        >
                          {copied === `a${i}` ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Block>
          </>
        )}
      </div>
    </div>
  )
}

function Block({ title, count, children }: { title: string; count?: number; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
        {title}
        {count !== undefined && count > 0 && <span className="ml-1 text-neutral-600">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Empty(): JSX.Element {
  return <p className="text-xs text-neutral-600">—</p>
}

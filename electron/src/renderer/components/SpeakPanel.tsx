import { useEffect, useState } from 'react'
import type { Utterance } from '../hooks/useTranscript'
import {
  ENGINE_LABELS,
  SPEAK_LANGUAGES,
  languageLabel,
  patchConfig,
  replayUtterance,
  speakText,
  stopSpeaking
} from '../lib/speak'

interface SpeakPanelProps {
  port: number | null
  utterances: Utterance[]
  configVersion: number
  onOpenSettings: () => void
}

interface TtsStatus {
  engine: string
  qwen_languages: string[]
  downloaded: boolean
  loaded: boolean
  system_voice: string | null
}

interface TtsConfig {
  tts_target_lang: string
  tts_engine: string
  tts_speak_mic: boolean
  tts_fallback_system: boolean
  tts_qwen_voice: string
}

const STATUS_STYLES: Record<Utterance['status'], string> = {
  queued: 'text-neutral-500',
  synthesizing: 'text-teal-400',
  playing: 'text-teal-300',
  done: 'text-neutral-500',
  error: 'text-red-400',
  stopped: 'text-neutral-600'
}

const OPEN_KEY = 'speakSectionOpen'

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

/** The Speak section of the sidebar: type or pick a line, translate it and say it. */
export function SpeakPanel({ port, utterances, configVersion, onOpenSettings }: SpeakPanelProps): JSX.Element {
  const [open, setOpen] = useState(readOpen)
  const [cfg, setCfg] = useState<TtsConfig>({
    tts_target_lang: 'en',
    tts_engine: 'system',
    tts_speak_mic: false,
    tts_fallback_system: true,
    tts_qwen_voice: 'ryan'
  })
  const [status, setStatus] = useState<TtsStatus | null>(null)
  const [text, setText] = useState('')
  const [translateFirst, setTranslateFirst] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const refresh = (): void => {
    if (!port) return
    fetch(`http://127.0.0.1:${port}/api/config`)
      .then((r) => r.json())
      .then((c) => setCfg(c))
      .catch(() => {})
    fetch(`http://127.0.0.1:${port}/api/tts/status`)
      .then((r) => r.json())
      .then((s) => setStatus(s))
      .catch(() => {})
  }

  const finished = utterances.filter((u) => u.status === 'done' || u.status === 'error').length
  useEffect(refresh, [port, configVersion, open, finished])

  const toggle = (): void => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, String(!o))
      } catch {
        // per-viewer convenience only
      }
      return !o
    })
  }

  const update = async (patch: Partial<TtsConfig>): Promise<void> => {
    setCfg((c) => ({ ...c, ...patch }))
    if (!port) return
    try {
      await patchConfig(port, patch)
      refresh()
    } catch (err) {
      console.error('Failed to save TTS setting:', err)
    }
  }

  const send = async (): Promise<void> => {
    if (!port || !text.trim()) return
    setError(null)
    try {
      const res = await speakText(port, text, { translate: translateFirst, targetLang: cfg.tts_target_lang })
      if (res.status === 'error') setError(res.message ?? 'Failed')
      else setText('')
    } catch {
      setError('Backend not reachable')
    }
  }

  const inFlight = utterances.filter((u) => u.status === 'playing' || u.status === 'synthesizing')
  const queued = utterances.filter((u) => u.status === 'queued')
  const busy = inFlight.length > 0 || queued.length > 0

  const isQwen = cfg.tts_engine !== 'system'
  const qwenHasLang = status?.qwen_languages.includes(cfg.tts_target_lang) ?? true
  const effectiveEngine = isQwen && !qwenHasLang && cfg.tts_fallback_system ? 'system' : cfg.tts_engine
  const voiceLabel =
    effectiveEngine === 'system'
      ? status === null
        ? '…'
        : status.system_voice ?? `no ${languageLabel(cfg.tts_target_lang)} voice installed`
      : cfg.tts_qwen_voice

  return (
    <section className="mt-4">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 mb-1.5"
        aria-expanded={open}
      >
        <span className={`text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        Speak
        {busy && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
        {!open && cfg.tts_speak_mic && <span className="text-[10px] text-teal-500">· speaking my lines</span>}
      </button>

      {/* Now playing stays visible when the section is closed */}
      {busy && (
        <div className="mb-2 px-2 py-1.5 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center gap-2">
          <span className="flex-1 text-[11px] text-teal-200 truncate">
            {inFlight[0]
              ? `${inFlight[0].status === 'synthesizing' ? 'Preparing' : 'Speaking'}: ${inFlight[0].text || inFlight[0].original}`
              : 'Waiting…'}
            {queued.length > 0 && <span className="text-neutral-500"> · {queued.length} queued</span>}
          </span>
          <button
            onClick={() => port && stopSpeaking(port)}
            className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 shrink-0"
          >
            ■ Stop
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-neutral-500 shrink-0">Say in</label>
            <select
              value={cfg.tts_target_lang}
              onChange={(e) => update({ tts_target_lang: e.target.value })}
              className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-teal-500"
            >
              {SPEAK_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onOpenSettings}
            className="w-full text-left text-[11px] text-neutral-500 hover:text-neutral-300 truncate"
            title="Change voice settings"
          >
            {ENGINE_LABELS[effectiveEngine] ?? effectiveEngine} · {voiceLabel} ⚙
          </button>
          {isQwen && !qwenHasLang && cfg.tts_fallback_system && (
            <p className="text-[11px] text-amber-400/80 leading-snug">
              Qwen3-TTS has no {languageLabel(cfg.tts_target_lang)} voice, so the macOS voice is used.
            </p>
          )}
          {cfg.tts_engine === 'qwen_local' && status && !status.downloaded && (
            <p className="text-[11px] text-amber-400/80 leading-snug">
              Qwen3-TTS model is not downloaded.{' '}
              <button onClick={onOpenSettings} className="underline hover:text-amber-300">
                Download in Settings
              </button>
            </p>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            rows={3}
            placeholder="Type in any language…"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-teal-500 resize-y"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={translateFirst}
                onChange={(e) => setTranslateFirst(e.target.checked)}
                className="rounded"
              />
              Translate first
            </label>
            <button
              onClick={send}
              disabled={!port || !text.trim()}
              className="px-2.5 py-1.5 text-xs rounded bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 transition-colors"
              title="⌘↩"
            >
              {translateFirst ? 'Translate & Speak' : 'Speak'} <span className="opacity-60">⌘↩</span>
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <label className="flex items-start gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={cfg.tts_speak_mic}
              onChange={(e) => update({ tts_speak_mic: e.target.checked })}
              className="rounded mt-0.5"
            />
            <span>
              Speak my speech
              <span className="block text-[11px] text-neutral-500">
                Translate each of your lines to {languageLabel(cfg.tts_target_lang)} and say it.
              </span>
            </span>
          </label>

          {/* History, newest first */}
          <div className="space-y-1.5 select-text pt-1">
            {utterances.length === 0 && (
              <p className="text-[11px] text-neutral-600 leading-relaxed">
                Spoken lines appear here. You can also click 🔊 on your own transcript lines or on a suggested answer.
              </p>
            )}
            {utterances.map((u) => (
              <div key={u.id} className="rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5">
                {u.text && u.text !== u.original && (
                  <p className="text-[11px] text-neutral-500 leading-snug mb-0.5">{u.original}</p>
                )}
                <p className="text-xs text-neutral-100 leading-snug">{u.text || u.original}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px]">
                  <span className="text-neutral-600 uppercase">{u.lang}</span>
                  {u.engine && <span className="text-neutral-600">{ENGINE_LABELS[u.engine] ?? u.engine}</span>}
                  <span className={`truncate ${STATUS_STYLES[u.status]}`}>{u.status === 'error' ? u.error : u.status}</span>
                  <span className="flex-1" />
                  {(u.status === 'done' || u.status === 'stopped') && (
                    <button onClick={() => port && replayUtterance(port, u.id)} className="text-neutral-400 hover:text-teal-300">
                      ▶ Replay
                    </button>
                  )}
                  {u.text && (
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(u.text)
                        setCopied(u.id)
                        setTimeout(() => setCopied(null), 1200)
                      }}
                      className="text-neutral-400 hover:text-neutral-200"
                    >
                      {copied === u.id ? '✓' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

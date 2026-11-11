import { useState, useEffect } from 'react'
import { TraceViewer } from './TraceViewer'
import { SPEAK_LANGUAGES, ENGINE_LABELS } from '../lib/speak'

// Keep in sync with DEFAULT_TEMPLATE in python/src/just_transcribe/pipeline/summarize.py
const DEFAULT_SUMMARY_PROMPT = `Summarize the following conversation for me.

Context about this conversation (may be empty):
{{context}}

Write in {{language}}.

Content:
{{content}}`

interface SettingsProps {
  port: number | null
  recording: boolean
  onClose: () => void
}

interface Config {
  preferred_language: string
  preferred_language_2: string
  asr_language: string
  asr_provider: string
  asr_model: string
  asr_base_url: string
  asr_api_key: string
  llm_api_base: string
  llm_model: string
  llm_api_key: string
  mic_enabled: boolean
  speaker_enabled: boolean
  asr_timeout_s: number
  debug_audio: boolean
  summary_mode: string
  summary_debounce_s: number
  summary_max_wait_s: number
  summary_min_segments: number
  summary_window_s: number
  summary_overlap_s: number
  summary_prompt: string
  tts_engine: string
  tts_target_lang: string
  tts_system_voice: string
  tts_qwen_model: string
  tts_qwen_voice: string
  tts_remote_url: string
  tts_remote_api_key: string
  tts_remote_model: string
  tts_output_device: string
  tts_fallback_system: boolean
  tts_speak_mic: boolean
}

interface TtsStatus {
  qwen_model: string
  qwen_languages: string[]
  qwen_voices: string[]
  downloaded: boolean
  downloading: boolean
  downloaded_bytes: number
  expected_bytes: number | null
  download_error: string
  loaded: boolean
  system_voice: string | null
}

const LOCALE_PREFIX: Record<string, string> = { yue: 'zh_HK', zh: 'zh_CN' }

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'yue', label: 'Cantonese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' }
]

const ASR_LANGUAGES = [
  { code: '', label: 'Auto-detect' },
  ...LANGUAGES
]

export function Settings({ port, recording, onClose }: SettingsProps): JSX.Element {
  const [config, setConfig] = useState<Config>({
    preferred_language: 'en',
    preferred_language_2: '',
    asr_language: '',
    asr_provider: 'local',
    asr_model: '',
    asr_base_url: '',
    asr_api_key: '',
    llm_api_base: '',
    llm_model: '',
    llm_api_key: '',
    mic_enabled: true,
    speaker_enabled: true,
    asr_timeout_s: 10,
    debug_audio: false,
    summary_mode: 'auto',
    summary_debounce_s: 10,
    summary_max_wait_s: 60,
    summary_min_segments: 2,
    summary_window_s: 600,
    summary_overlap_s: 60,
    summary_prompt: '',
    tts_engine: 'system',
    tts_target_lang: 'en',
    tts_system_voice: '',
    tts_qwen_model: '',
    tts_qwen_voice: 'ryan',
    tts_remote_url: '',
    tts_remote_api_key: '',
    tts_remote_model: '',
    tts_output_device: '',
    tts_fallback_system: true,
    tts_speak_mic: false
  })
  const [ttsStatus, setTtsStatus] = useState<TtsStatus | null>(null)
  const [voices, setVoices] = useState<{ name: string; locale: string }[]>([])
  const [devices, setDevices] = useState<string[]>([])
  const [ttsRemoteModels, setTtsRemoteModels] = useState<string[]>([])
  const [ttsTestStatus, setTtsTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [reinstalling, setReinstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [showUninstall, setShowUninstall] = useState(false)
  const [showTraceViewer, setShowTraceViewer] = useState(false)
  const [localAsr, setLocalAsr] = useState({ model: '' })
  const [remoteAsr, setRemoteAsr] = useState({ base_url: '', api_key: '', model: '' })
  const [llmRemoteModels, setLlmRemoteModels] = useState<string[]>([])
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestStatus, setLlmTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (!port) return
    fetch(`http://127.0.0.1:${port}/api/config`)
      .then((r) => r.json())
      .then((cfg) => {
        setConfig(cfg)
        if (cfg.asr_provider === 'remote') {
          setRemoteAsr({ base_url: cfg.asr_base_url, api_key: cfg.asr_api_key, model: cfg.asr_model })
          setLocalAsr({ model: '' })
        } else {
          setLocalAsr({ model: cfg.asr_model })
          setRemoteAsr({ base_url: cfg.asr_base_url, api_key: cfg.asr_api_key, model: cfg.asr_model })
        }
        if (cfg.asr_provider === 'remote' && cfg.asr_base_url) {
          testRemote(cfg.asr_base_url, cfg.asr_api_key)
        }
        if (cfg.llm_api_base) {
          testLlmRemote(cfg.llm_api_base, cfg.llm_api_key)
        }
      })
      .catch(console.error)
  }, [port])

  // Voice (TTS): voices, devices, model status (polled while downloading)
  useEffect(() => {
    if (!port) return
    fetch(`http://127.0.0.1:${port}/api/tts/voices`).then((r) => r.json()).then((d) => setVoices(d.voices || [])).catch(() => {})
    fetch(`http://127.0.0.1:${port}/api/tts/devices`).then((r) => r.json()).then((d) => setDevices(d.devices || [])).catch(() => {})
  }, [port])

  useEffect(() => {
    if (!port) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    const poll = (): void => {
      fetch(`http://127.0.0.1:${port}/api/tts/status`)
        .then((r) => r.json())
        .then((st: TtsStatus) => {
          if (!alive) return
          setTtsStatus(st)
          if (st.downloading) timer = setTimeout(poll, 1000)
        })
        .catch(() => {})
    }
    poll()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [port, ttsStatus?.downloading])

  const startTtsDownload = async (): Promise<void> => {
    if (!port) return
    await fetch(`http://127.0.0.1:${port}/api/tts/download`, { method: 'POST' })
    setTtsStatus((s) => (s ? { ...s, downloading: true, download_error: '' } : s))
  }

  const testTtsRemote = async (): Promise<void> => {
    if (!port || !config.tts_remote_url) return
    setTtsTestStatus('idle')
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.tts_remote_url, api_key: config.tts_remote_api_key })
      })
      const result = await res.json()
      setTtsTestStatus(result.ok ? 'ok' : 'error')
      setTtsRemoteModels(result.ok ? result.models || [] : [])
      if (result.ok && !config.tts_remote_model && result.models?.length) {
        setConfig((c) => ({ ...c, tts_remote_model: result.models[0] }))
      }
    } catch {
      setTtsTestStatus('error')
    }
  }

  const testRemote = async (url: string, apiKey: string): Promise<boolean> => {
    if (!url) {
      setError('Server URL is required')
      return false
    }
    if (!port) {
      setError('Backend not running — restart the app')
      return false
    }
    setTesting(true)
    setTestStatus('idle')
    setError(null)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/asr/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, api_key: apiKey })
      })
      const result = await res.json()
      if (result.ok) {
        setRemoteModels(result.models || [])
        setTestStatus('ok')
        setError(null)
        if (!remoteAsr.model || !result.models?.includes(remoteAsr.model)) {
          if (result.models?.length > 0) {
            setRemoteAsr((r) => ({ ...r, model: result.models[0] }))
          }
        }
        return true
      } else {
        setRemoteModels([])
        setTestStatus('error')
        setError(result.error || 'Connection failed')
        return false
      }
    } catch (err) {
      setTestStatus('error')
      setError('Failed to test connection')
      return false
    } finally {
      setTesting(false)
    }
  }

  const testLlmRemote = async (url: string, apiKey: string): Promise<boolean> => {
    if (!url) {
      setError('Server URL is required')
      return false
    }
    if (!port) {
      setError('Backend not running — restart the app')
      return false
    }
    setLlmTesting(true)
    setLlmTestStatus('idle')
    setError(null)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, api_key: apiKey })
      })
      const result = await res.json()
      if (result.ok) {
        setLlmRemoteModels(result.models || [])
        setLlmTestStatus('ok')
        setError(null)
        if (!config.llm_model || !result.models?.includes(config.llm_model)) {
          if (result.models?.length > 0) {
            setConfig((c) => ({ ...c, llm_model: result.models[0] }))
          }
        }
        return true
      } else {
        setLlmRemoteModels([])
        setLlmTestStatus('error')
        setError(result.error || 'Connection failed')
        return false
      }
    } catch (err) {
      setLlmTestStatus('error')
      setError('Failed to test connection')
      return false
    } finally {
      setLlmTesting(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!port) return
    setError(null)
    setSaving(true)
    const payload = { ...config }
    if (config.asr_provider === 'local') {
      payload.asr_model = localAsr.model
      payload.asr_base_url = ''
      payload.asr_api_key = ''
    } else {
      payload.asr_model = remoteAsr.model
      payload.asr_base_url = remoteAsr.base_url
      payload.asr_api_key = remoteAsr.api_key
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = await res.json()
      if (result.status === 'error') {
        setError(result.message)
      } else {
        onClose()
      }
    } catch (err) {
      setError('Failed to save config')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-teal-500'
  const selectClass = inputClass

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 no-drag select-text">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-[480px] max-h-[80vh] flex flex-col">
        {/* Fixed header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Error banner */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* ── Section 1: Audio & Language ── */}
          <Section title="Audio & Language">
            {/* Audio sources */}
            <Field label="Audio Sources">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={config.mic_enabled}
                    onChange={(e) => setConfig({ ...config, mic_enabled: e.target.checked })}
                    className="rounded"
                  />
                  Microphone
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={config.speaker_enabled}
                    onChange={(e) => setConfig({ ...config, speaker_enabled: e.target.checked })}
                    className="rounded"
                  />
                  System Audio
                </label>
              </div>
            </Field>

            {/* ASR Language */}
            <Field label="Recognition Language" hint="Set if auto-detect is inaccurate">
              <select
                value={config.asr_language}
                onChange={(e) => setConfig({ ...config, asr_language: e.target.value })}
                className={selectClass}
              >
                {ASR_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Translation languages */}
            <Field label="Translation Language 1">
              <select
                value={config.preferred_language}
                onChange={(e) => {
                  const newLang = e.target.value
                  const updates: Partial<Config> = { preferred_language: newLang }
                  if (newLang === config.preferred_language_2) {
                    updates.preferred_language_2 = ''
                  }
                  setConfig({ ...config, ...updates })
                }}
                className={selectClass}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Translation Language 2" hint="Optional — adds a second translation per segment">
              <select
                value={config.preferred_language_2}
                onChange={(e) => setConfig({ ...config, preferred_language_2: e.target.value })}
                className={selectClass}
              >
                <option value="">None</option>
                {LANGUAGES.filter((l) => l.code !== config.preferred_language).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          {/* ── Section 2: ASR Model ── */}
          <Section title="Speech Recognition (ASR)">
            {/* Provider toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  if (!recording) {
                    setConfig((c) => ({ ...c, asr_provider: 'local' }))
                    setTestStatus('idle')
                    setError(null)
                  }
                }}
                disabled={recording}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  config.asr_provider === 'local'
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                } ${recording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Local
              </button>
              <button
                onClick={() => {
                  if (!recording) {
                    setConfig((c) => ({ ...c, asr_provider: 'remote' }))
                    setError(null)
                  }
                }}
                disabled={recording}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  config.asr_provider === 'remote'
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                } ${recording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Remote
              </button>
            </div>
            {recording && (
              <p className="text-xs text-amber-400/70 mb-3">Stop recording to switch</p>
            )}

            {/* Local ASR config */}
            {config.asr_provider === 'local' && (
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4">
                <Field label="Model" hint="HuggingFace model ID, must be in ~/.cache/huggingface/hub/">
                  <input
                    type="text"
                    placeholder="mlx-community/Qwen3-ASR-1.7B-8bit"
                    value={localAsr.model}
                    onChange={(e) => setLocalAsr({ ...localAsr, model: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}

            {/* Remote ASR config */}
            {config.asr_provider === 'remote' && (
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 space-y-3">
                <Field label="Server URL">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="http://192.168.1.100:8000"
                      value={remoteAsr.base_url}
                      onChange={(e) => {
                        setRemoteAsr({ ...remoteAsr, base_url: e.target.value })
                        setTestStatus('idle')
                      }}
                      className={`flex-1 ${inputClass}`}
                    />
                    <button
                      onClick={() => testRemote(remoteAsr.base_url, remoteAsr.api_key)}
                      disabled={testing || !remoteAsr.base_url}
                      className="px-3 py-2 text-sm bg-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-600 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {testing ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </Field>

                <Field label="API Key (optional)">
                  <input
                    type="password"
                    placeholder="Leave empty if not required"
                    value={remoteAsr.api_key}
                    onChange={(e) => setRemoteAsr({ ...remoteAsr, api_key: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Request Timeout (seconds)" hint="Fail fast if the server hangs — keeps the pipeline responsive">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={config.asr_timeout_s}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setConfig({ ...config, asr_timeout_s: Number.isFinite(v) && v > 0 ? v : 10 })
                    }}
                    className={inputClass}
                  />
                </Field>

                {/* Connection status */}
                {testStatus === 'ok' && (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    Connected — {remoteModels.length} model{remoteModels.length !== 1 ? 's' : ''} available
                  </div>
                )}
                {testStatus === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    Connection failed
                  </div>
                )}

                <Field label="Model" hint={remoteModels.length === 0 ? 'Click Test to discover models' : undefined}>
                  {remoteModels.length > 0 ? (
                    <select
                      value={remoteAsr.model}
                      onChange={(e) => setRemoteAsr({ ...remoteAsr, model: e.target.value })}
                      className={selectClass}
                    >
                      {remoteModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. mlx-community/Qwen3-ASR-1.7B-8bit"
                      value={remoteAsr.model}
                      onChange={(e) => setRemoteAsr({ ...remoteAsr, model: e.target.value })}
                      className={inputClass}
                    />
                  )}
                </Field>
              </div>
            )}
          </Section>

          {/* ── Section 3: Translation (LLM) ── */}
          <Section title="Translation (LLM)">
            {/* Remote LLM */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 px-3 py-2 text-sm rounded-lg border bg-neutral-800 text-neutral-600 border-neutral-700 text-center cursor-default">
                Local
                <span className="ml-1.5 text-[10px] text-neutral-600 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5">
                  soon
                </span>
              </div>
              <div className="flex-1 px-3 py-2 text-sm rounded-lg border bg-teal-500/20 text-teal-400 border-teal-500/30 text-center">
                Remote
              </div>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 space-y-3">
              <Field label="Server URL">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. https://api.openai.com"
                    value={config.llm_api_base}
                    onChange={(e) => {
                      setConfig({ ...config, llm_api_base: e.target.value })
                      setLlmTestStatus('idle')
                    }}
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    onClick={() => testLlmRemote(config.llm_api_base, config.llm_api_key)}
                    disabled={llmTesting || !config.llm_api_base}
                    className="px-3 py-2 text-sm bg-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-600 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {llmTesting ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </Field>

              <Field label="API Key (optional)">
                <input
                  type="password"
                  placeholder="Leave empty if not required"
                  value={config.llm_api_key}
                  onChange={(e) => setConfig({ ...config, llm_api_key: e.target.value })}
                  className={inputClass}
                />
              </Field>

              {/* Connection status */}
              {llmTestStatus === 'ok' && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  Connected — {llmRemoteModels.length} model{llmRemoteModels.length !== 1 ? 's' : ''} available
                </div>
              )}
              {llmTestStatus === 'error' && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  Connection failed
                </div>
              )}

              <Field label="Model" hint={llmRemoteModels.length === 0 && !config.llm_model ? 'Click Test to discover models' : undefined}>
                {llmRemoteModels.length > 0 ? (
                  <select
                    value={config.llm_model}
                    onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                    className={selectClass}
                  >
                    {llmRemoteModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. gpt-4o-mini"
                    value={config.llm_model}
                    onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                    className={inputClass}
                  />
                )}
              </Field>
              {!config.llm_api_base && (
                <p className="text-xs text-neutral-600">
                  Configure to enable automatic translation
                </p>
              )}
            </div>
          </Section>

          {/* ── AI Summary ── */}
          <Section title="AI Summary">
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 space-y-3">
              <Field label="Trigger" hint="Uses the Translation (LLM) server and model">
                <div className="flex gap-2">
                  {[
                    { value: 'auto', label: 'Auto (after a pause)' },
                    { value: 'manual', label: 'Manual (button only)' }
                  ].map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setConfig({ ...config, summary_mode: m.value })}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        config.summary_mode === m.value
                          ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </Field>

              {config.summary_mode === 'auto' && (
                <div className="flex gap-3">
                  <Field label="Pause (seconds)" hint="Silence after the last line">
                    <input
                      type="number"
                      min={2}
                      max={300}
                      value={config.summary_debounce_s}
                      onChange={(e) => setConfig({ ...config, summary_debounce_s: Number(e.target.value) || 10 })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Max wait (seconds)" hint="While people keep talking; 0 = off">
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={config.summary_max_wait_s}
                      onChange={(e) => setConfig({ ...config, summary_max_wait_s: Math.max(0, Number(e.target.value) || 0) })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Min. new lines" hint="Lines since last summary">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={config.summary_min_segments}
                      onChange={(e) => setConfig({ ...config, summary_min_segments: Number(e.target.value) || 2 })}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}

              <div className="flex gap-3">
                <Field label="Window (minutes)" hint="Max new transcript per LLM call">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={Math.round(config.summary_window_s / 60)}
                    onChange={(e) => setConfig({ ...config, summary_window_s: (Number(e.target.value) || 10) * 60 })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Overlap (seconds)" hint="Earlier lines repeated">
                  <input
                    type="number"
                    min={0}
                    max={600}
                    value={config.summary_overlap_s}
                    onChange={(e) => setConfig({ ...config, summary_overlap_s: Math.max(0, Number(e.target.value)) })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                label="Prompt template"
                hint="Placeholders: {{content}} (transcript), {{context}} (session context), {{language}} (preferred language). The app adds the JSON output format."
              >
                <textarea
                  value={config.summary_prompt || DEFAULT_SUMMARY_PROMPT}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      summary_prompt: e.target.value === DEFAULT_SUMMARY_PROMPT ? '' : e.target.value
                    })
                  }
                  rows={8}
                  className={`${inputClass} font-mono text-xs resize-y`}
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[11px] text-neutral-600">
                    {config.summary_prompt ? 'Custom template' : 'Default template'}
                  </span>
                  <button
                    onClick={() => setConfig({ ...config, summary_prompt: '' })}
                    disabled={!config.summary_prompt}
                    className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
                  >
                    Reset to default
                  </button>
                </div>
              </Field>
            </div>
          </Section>

          {/* ── Voice (TTS) ── */}
          <Section title="Voice (Translate & Speak)">
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 space-y-3">
              <Field label="Engine">
                <div className="flex gap-2">
                  {['system', 'qwen_local', 'qwen_remote'].map((e) => (
                    <button
                      key={e}
                      onClick={() => setConfig({ ...config, tts_engine: e })}
                      className={`flex-1 px-2 py-2 text-xs rounded-lg border transition-colors ${
                        config.tts_engine === e
                          ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200'
                      }`}
                    >
                      {ENGINE_LABELS[e]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Speak in" hint="The language of the other person">
                <select
                  value={config.tts_target_lang}
                  onChange={(e) => setConfig({ ...config, tts_target_lang: e.target.value })}
                  className={selectClass}
                >
                  {SPEAK_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </Field>

              {config.tts_engine === 'system' ? (
                <Field label="macOS voice" hint="Add voices in System Settings → Accessibility → Spoken Content">
                  <select
                    value={config.tts_system_voice}
                    onChange={(e) => setConfig({ ...config, tts_system_voice: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Automatic for the language</option>
                    {voices
                      .filter((v) => {
                        const prefix = LOCALE_PREFIX[config.tts_target_lang]
                        return prefix ? v.locale === prefix : v.locale.split('_')[0] === config.tts_target_lang
                      })
                      .map((v) => (
                        <option key={v.name} value={v.name}>{v.name} ({v.locale})</option>
                      ))}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Qwen3-TTS voice">
                    <select
                      value={config.tts_qwen_voice}
                      onChange={(e) => setConfig({ ...config, tts_qwen_voice: e.target.value })}
                      className={selectClass}
                    >
                      {(ttsStatus?.qwen_voices ?? ['ryan']).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-start gap-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={config.tts_fallback_system}
                      onChange={(e) => setConfig({ ...config, tts_fallback_system: e.target.checked })}
                      className="rounded mt-1"
                    />
                    <span>
                      Use the macOS voice for other languages
                      <span className="block text-xs text-neutral-600">
                        Qwen3-TTS lists: {(ttsStatus?.qwen_languages ?? []).join(', ')}. Vietnamese is not listed.
                      </span>
                    </span>
                  </label>
                </>
              )}

              {config.tts_engine === 'qwen_local' && ttsStatus && (
                <Field label="Qwen3-TTS model" hint={ttsStatus.qwen_model}>
                  {ttsStatus.downloaded && !ttsStatus.downloading ? (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      Downloaded{ttsStatus.loaded ? ' · loaded' : ' · loads on first use (~40 s)'}
                    </div>
                  ) : ttsStatus.downloading ? (
                    <div>
                      <div className="h-1.5 bg-neutral-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-teal-500 transition-all"
                          style={{
                            width: `${ttsStatus.expected_bytes ? Math.min(100, (100 * ttsStatus.downloaded_bytes) / ttsStatus.expected_bytes) : 50}%`
                          }}
                        />
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        Downloading… {(ttsStatus.downloaded_bytes / 1e9).toFixed(2)}
                        {ttsStatus.expected_bytes ? ` / ${(ttsStatus.expected_bytes / 1e9).toFixed(1)}` : ''} GB
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={startTtsDownload}
                        className="px-3 py-1.5 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                      >
                        Download (~2 GB)
                      </button>
                      {ttsStatus.download_error && (
                        <span className="text-xs text-red-400 truncate" title={ttsStatus.download_error}>
                          {ttsStatus.download_error}
                        </span>
                      )}
                    </div>
                  )}
                </Field>
              )}

              {config.tts_engine === 'qwen_remote' && (
                <>
                  <Field label="Server URL" hint="OpenAI-compatible /v1/audio/speech, e.g. mlx_audio.server">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. http://127.0.0.1:8000"
                        value={config.tts_remote_url}
                        onChange={(e) => {
                          setConfig({ ...config, tts_remote_url: e.target.value })
                          setTtsTestStatus('idle')
                        }}
                        className={`flex-1 ${inputClass}`}
                      />
                      <button
                        onClick={testTtsRemote}
                        disabled={!config.tts_remote_url}
                        className="px-3 py-2 text-sm bg-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-600 disabled:opacity-50 transition-colors shrink-0"
                      >
                        Test
                      </button>
                    </div>
                  </Field>
                  {ttsTestStatus !== 'idle' && (
                    <div className={`flex items-center gap-2 text-xs ${ttsTestStatus === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${ttsTestStatus === 'ok' ? 'bg-green-400' : 'bg-red-400'}`} />
                      {ttsTestStatus === 'ok' ? 'Connected' : 'Connection failed'}
                    </div>
                  )}
                  <Field label="API Key (optional)">
                    <input
                      type="password"
                      value={config.tts_remote_api_key}
                      onChange={(e) => setConfig({ ...config, tts_remote_api_key: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Model">
                    {ttsRemoteModels.length > 0 ? (
                      <select
                        value={config.tts_remote_model}
                        onChange={(e) => setConfig({ ...config, tts_remote_model: e.target.value })}
                        className={selectClass}
                      >
                        {ttsRemoteModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="e.g. mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"
                        value={config.tts_remote_model}
                        onChange={(e) => setConfig({ ...config, tts_remote_model: e.target.value })}
                        className={inputClass}
                      />
                    )}
                  </Field>
                </>
              )}

              <Field label="Output device" hint="To send the voice into a call, select a virtual device (e.g. BlackHole) and use it as the call's microphone">
                <select
                  value={config.tts_output_device}
                  onChange={(e) => setConfig({ ...config, tts_output_device: e.target.value })}
                  className={selectClass}
                >
                  <option value="">System default</option>
                  {config.tts_output_device && !devices.includes(config.tts_output_device) && (
                    <option value={config.tts_output_device}>{config.tts_output_device} (not connected)</option>
                  )}
                  {devices.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          {/* ── Section 4: Overlay & System ── */}
          <Section title="Overlay & System">
            <Field label="Overlay Position" hint="Where captions appear when in overlay mode">
              <OverlayPositionPicker />
            </Field>

            <Field label="Launch at Login">
              <LaunchAtLoginToggle />
            </Field>
          </Section>

          {/* ── Section 5: Debugging ── */}
          <Section title="Debugging">
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 space-y-3">
              <Field label="Debug Audio Recording" hint="Saves audio sent to ASR under ~/.just-transcribe/sessions/ for troubleshooting">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={config.debug_audio}
                    onChange={(e) => setConfig({ ...config, debug_audio: e.target.checked })}
                    className="rounded"
                  />
                  Save audio segments for debugging
                </label>
              </Field>

              <Field label="Trace Sessions" hint="Browse pipeline trace events, transcripts, and recorded audio per session">
                <button
                  onClick={() => setShowTraceViewer(true)}
                  className="px-4 py-2 text-sm bg-neutral-800 text-neutral-300 border border-neutral-700 rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  Open Debug Sessions
                </button>
              </Field>
            </div>
          </Section>

          {/* ── Section 6: Maintenance ── */}
          <Section title="Maintenance">
            <button
              onClick={async () => {
                setReinstalling(true)
                setError(null)
                try {
                  const result = await window.api.reinstallBackend()
                  if (!result.success) {
                    setError(result.error || 'Reinstall failed')
                  }
                } catch {
                  setError('Reinstall failed')
                } finally {
                  setReinstalling(false)
                }
              }}
              disabled={reinstalling || recording}
              className="px-4 py-2 text-sm bg-neutral-800 text-neutral-300 border border-neutral-700 rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            >
              {reinstalling ? 'Reinstalling...' : 'Reinstall Backend'}
            </button>
            <p className="text-xs text-neutral-600 mt-1">
              Re-syncs Python dependencies and restarts the backend.
            </p>

            {/* Uninstall — collapsible */}
            <div className="mt-4">
              <button
                onClick={() => setShowUninstall(!showUninstall)}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-400 transition-colors"
              >
                <span className={`transition-transform ${showUninstall ? 'rotate-90' : ''}`}>&#9654;</span>
                Uninstall
              </button>
              {showUninstall && (
                <div className="mt-2 space-y-2">
                  <UninstallItem label="Remove app" command="rm -rf /Applications/Just\ Transcribe.app" />
                  <UninstallItem label="Remove app data" command="rm -rf ~/.just-transcribe ~/Library/Application\ Support/just-transcribe" />
                  <UninstallItem label="Remove ASR model (~3.5 GB)" command="rm -rf ~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B" />
                  <UninstallItem label="Remove voice model (~2 GB)" command="rm -rf ~/.cache/huggingface/hub/models--mlx-community--Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit" />
                  <p className="text-xs text-neutral-600 mt-1">
                    Run in Terminal to remove each component.
                  </p>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* Trace viewer overlay */}
      {showTraceViewer && (
        <TraceViewer port={port} onClose={() => setShowTraceViewer(false)} />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="mb-3 last:mb-0">
      <label className="block text-xs text-neutral-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-600 mt-1">{hint}</p>}
    </div>
  )
}

const POSITIONS = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right']
]

function OverlayPositionPicker(): JSX.Element {
  const [position, setPosition] = useState('bottom-center')

  useEffect(() => {
    window.api.getElectronConfig().then((cfg) => setPosition(cfg.overlay_position))
  }, [])

  const handleSelect = (pos: string): void => {
    setPosition(pos)
    window.api.setElectronConfig({ overlay_position: pos })
  }

  return (
    <div className="inline-grid grid-cols-3 gap-1">
      {POSITIONS.map((row) =>
        row.map((pos) => (
          <button
            key={pos}
            onClick={() => handleSelect(pos)}
            className={`w-8 h-6 rounded border transition-colors ${
              position === pos
                ? 'bg-teal-500/30 border-teal-500/50'
                : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
            }`}
            title={pos}
          />
        ))
      )}
    </div>
  )
}

function LaunchAtLoginToggle(): JSX.Element {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    window.api.getElectronConfig().then((cfg) => setEnabled(cfg.launch_at_login))
  }, [])

  const toggle = (): void => {
    const next = !enabled
    setEnabled(next)
    window.api.setElectronConfig({ launch_at_login: next })
  }

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      <input type="checkbox" checked={enabled} onChange={toggle} className="rounded" />
      Start automatically when you log in
    </label>
  )
}

function UninstallItem({ label, command }: { label: string; command: string }): JSX.Element {
  return (
    <div>
      <span className="text-xs text-neutral-500">{label}:</span>
      <code className="block text-xs text-red-300 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 mt-0.5 select-all">
        {command}
      </code>
    </div>
  )
}

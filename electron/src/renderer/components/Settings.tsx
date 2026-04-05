import { useState, useEffect } from 'react'

interface SettingsProps {
  port: number | null
  recording: boolean
  onClose: () => void
}

interface Config {
  preferred_language: string
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
}

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
    asr_language: '',
    asr_provider: 'local',
    asr_model: '',
    asr_base_url: '',
    asr_api_key: '',
    llm_api_base: '',
    llm_model: '',
    llm_api_key: '',
    mic_enabled: true,
    speaker_enabled: true
  })
  const [saving, setSaving] = useState(false)
  const [reinstalling, setReinstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [showUninstall, setShowUninstall] = useState(false)

  useEffect(() => {
    if (!port) return
    fetch(`http://127.0.0.1:${port}/api/config`)
      .then((r) => r.json())
      .then((cfg) => {
        setConfig(cfg)
        if (cfg.asr_provider === 'remote' && cfg.asr_base_url) {
          testRemote(cfg.asr_base_url, cfg.asr_api_key)
        }
      })
      .catch(console.error)
  }, [port])

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
        if (!config.asr_model || !result.models?.includes(config.asr_model)) {
          if (result.models?.length > 0) {
            setConfig((c) => ({ ...c, asr_model: result.models[0] }))
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

  const save = async (): Promise<void> => {
    if (!port) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
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
    'w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-blue-500'
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
              className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
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

            {/* Translation language */}
            <Field label="Translation Language">
              <select
                value={config.preferred_language}
                onChange={(e) => setConfig({ ...config, preferred_language: e.target.value })}
                className={selectClass}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
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
          </Section>

          {/* ── Section 2: ASR Model ── */}
          <Section title="Speech Recognition (ASR)">
            {/* Provider toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  if (!recording) {
                    setConfig({ ...config, asr_provider: 'local' })
                    setTestStatus('idle')
                    setError(null)
                  }
                }}
                disabled={recording}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  config.asr_provider === 'local'
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-neutral-300'
                } ${recording ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Local
              </button>
              <button
                onClick={() => {
                  if (!recording) {
                    setConfig({ ...config, asr_provider: 'remote' })
                    setError(null)
                  }
                }}
                disabled={recording}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  config.asr_provider === 'remote'
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
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
                    placeholder="Qwen/Qwen3-ASR-1.7B"
                    value={config.asr_model}
                    onChange={(e) => setConfig({ ...config, asr_model: e.target.value })}
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
                      value={config.asr_base_url}
                      onChange={(e) => {
                        setConfig({ ...config, asr_base_url: e.target.value })
                        setTestStatus('idle')
                      }}
                      className={`flex-1 ${inputClass}`}
                    />
                    <button
                      onClick={() => testRemote(config.asr_base_url, config.asr_api_key)}
                      disabled={testing || !config.asr_base_url}
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
                    value={config.asr_api_key}
                    onChange={(e) => setConfig({ ...config, asr_api_key: e.target.value })}
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
                      value={config.asr_model}
                      onChange={(e) => setConfig({ ...config, asr_model: e.target.value })}
                      className={selectClass}
                    >
                      {remoteModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. Qwen/Qwen3-ASR-1.7B"
                      value={config.asr_model}
                      onChange={(e) => setConfig({ ...config, asr_model: e.target.value })}
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
              <div className="flex-1 px-3 py-2 text-sm rounded-lg border bg-blue-500/20 text-blue-400 border-blue-500/30 text-center">
                Remote
              </div>
              <div className="flex-1 px-3 py-2 text-sm rounded-lg border bg-neutral-800 text-neutral-600 border-neutral-700 text-center cursor-default">
                Local
                <span className="ml-1.5 text-[10px] text-neutral-600 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5">
                  soon
                </span>
              </div>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 space-y-3">
              <Field label="API Base URL">
                <input
                  type="text"
                  placeholder="e.g. https://api.openai.com"
                  value={config.llm_api_base}
                  onChange={(e) => setConfig({ ...config, llm_api_base: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Model">
                <input
                  type="text"
                  placeholder="e.g. gpt-4o-mini"
                  value={config.llm_model}
                  onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  placeholder="Leave empty if not required"
                  value={config.llm_api_key}
                  onChange={(e) => setConfig({ ...config, llm_api_key: e.target.value })}
                  className={inputClass}
                />
              </Field>
              {!config.llm_api_base && (
                <p className="text-xs text-neutral-600">
                  Configure to enable automatic translation
                </p>
              )}
            </div>
          </Section>

          {/* ── Section 4: Maintenance ── */}
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
                  <p className="text-xs text-neutral-600 mt-1">
                    Run in Terminal to remove each component.
                  </p>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
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

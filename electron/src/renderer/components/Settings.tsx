import { useState, useEffect } from 'react'

interface SettingsProps {
  port: number | null
  onClose: () => void
}

interface Config {
  preferred_language: string
  asr_language: string
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

export function Settings({ port, onClose }: SettingsProps): JSX.Element {
  const [config, setConfig] = useState<Config>({
    preferred_language: 'en',
    asr_language: '',
    llm_api_base: '',
    llm_model: '',
    llm_api_key: '',
    mic_enabled: true,
    speaker_enabled: true
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!port) return
    fetch(`http://127.0.0.1:${port}/api/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(console.error)
  }, [port])

  const save = async (): Promise<void> => {
    if (!port) return
    setSaving(true)
    try {
      await fetch(`http://127.0.0.1:${port}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      onClose()
    } catch (err) {
      console.error('Failed to save config:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 no-drag">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-[480px] max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-neutral-100 mb-5">Settings</h2>

        {/* Preferred language */}
        <div className="mb-5">
          <label className="block text-xs text-neutral-400 mb-1.5">
            Preferred Language (translations target)
          </label>
          <select
            value={config.preferred_language}
            onChange={(e) => setConfig({ ...config, preferred_language: e.target.value })}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* ASR Language */}
        <div className="mb-5">
          <label className="block text-xs text-neutral-400 mb-1.5">
            Speech Recognition Language
          </label>
          <select
            value={config.asr_language}
            onChange={(e) => setConfig({ ...config, asr_language: e.target.value })}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            {ASR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-600 mt-1">
            Set if auto-detect is inaccurate for your language
          </p>
        </div>

        {/* Audio sources */}
        <div className="mb-5">
          <label className="block text-xs text-neutral-400 mb-1.5">Audio Sources</label>
          <div className="space-y-2">
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
              System Audio (Speaker)
            </label>
          </div>
        </div>

        {/* LLM API */}
        <div className="mb-5">
          <label className="block text-xs text-neutral-400 mb-1.5">
            LLM API (for translation)
          </label>
          <input
            type="text"
            placeholder="API Base URL (e.g., https://api.openai.com)"
            value={config.llm_api_base}
            onChange={(e) => setConfig({ ...config, llm_api_base: e.target.value })}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 mb-2 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Model name (e.g., gpt-4o-mini)"
            value={config.llm_model}
            onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 mb-2 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="API Key"
            value={config.llm_api_key}
            onChange={(e) => setConfig({ ...config, llm_api_key: e.target.value })}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Uninstall */}
        <div className="mb-5 border-t border-neutral-800 pt-5">
          <label className="block text-xs text-neutral-400 mb-2">Uninstall</label>
          <div className="space-y-2">
            <UninstallItem
              label="Remove app"
              command="rm -rf /Applications/Just\ Transcribe.app"
            />
            <UninstallItem
              label="Remove app data"
              command="rm -rf ~/.just-transcribe ~/Library/Application\ Support/just-transcribe"
            />
            <UninstallItem
              label="Remove ASR model (~3.5 GB)"
              command="rm -rf ~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B"
            />
          </div>
          <p className="text-xs text-neutral-600 mt-2">
            Run these commands in Terminal to remove each component independently.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
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

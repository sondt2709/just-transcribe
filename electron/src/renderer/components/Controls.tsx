import { useState } from 'react'
import { copyTranscript, clearTranscript } from '../lib/transcriptActions'

const ASR_LANGUAGES = [
  { code: '', label: 'Auto' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'yue', label: 'Cantonese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' }
]

interface ControlsProps {
  recording: boolean
  connected: boolean
  modelLoaded: boolean
  port: number | null
  asrLanguage: string
  onAsrLanguageChange: (lang: string) => void
  onStart: () => void
  onStop: () => void
  onSettingsClick: () => void
}

export function Controls({
  recording,
  connected,
  modelLoaded,
  port,
  asrLanguage,
  onAsrLanguageChange,
  onStart,
  onStop,
  onSettingsClick
}: ControlsProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    if (!port) return
    try {
      const ok = await copyTranscript(port)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch (err) {
      console.error('Copy transcript failed:', err)
    }
  }

  const handleClear = async (): Promise<void> => {
    if (!port) return
    try {
      await clearTranscript(port)
    } catch (err) {
      console.error('Clear transcript failed:', err)
    }
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Status indicators */}
      <div className="space-y-2 mb-6">
        <StatusDot label="Backend" active={connected} />
        <StatusDot label="Model" active={modelLoaded} />
        <StatusDot label="Recording" active={recording} pulse />
      </div>

      {/* Record button */}
      <button
        onClick={recording ? onStop : onStart}
        disabled={!connected || !modelLoaded}
        className={`w-full py-3 rounded-lg font-medium text-sm transition-all ${
          recording
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
            : connected && modelLoaded
              ? 'bg-teal-500 text-white hover:bg-teal-600'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
        }`}
      >
        {recording ? 'Stop' : 'Start'}
      </button>

      {!connected && (
        <p className="text-xs text-neutral-600 mt-2 text-center">
          Waiting for backend...
        </p>
      )}

      {/* Quick language selector */}
      <div className="mt-4">
        <label className="block text-xs text-neutral-500 mb-1.5">Source language</label>
        <div className="flex flex-wrap gap-1">
          {ASR_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => onAsrLanguageChange(l.code)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                asrLanguage === l.code
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300 border border-neutral-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transcript actions */}
      <div className="mt-4">
        <label className="block text-xs text-neutral-500 mb-1.5">Transcript</label>
        <div className="flex gap-1.5">
          <button
            onClick={handleCopy}
            disabled={!port}
            className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
              copied
                ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-neutral-700'
            }`}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button
            onClick={handleClear}
            disabled={!port}
            className="flex-1 px-2 py-1.5 text-xs rounded bg-neutral-800 text-neutral-400 hover:text-red-400 border border-neutral-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings button */}
      <button
        onClick={onSettingsClick}
        className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Settings
      </button>
    </div>
  )
}

function StatusDot({
  label,
  active,
  pulse = false
}: {
  label: string
  active: boolean
  pulse?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          active
            ? `bg-green-400 ${pulse ? 'animate-pulse' : ''}`
            : 'bg-neutral-700'
        }`}
      />
      <span className="text-xs text-neutral-400">{label}</span>
    </div>
  )
}

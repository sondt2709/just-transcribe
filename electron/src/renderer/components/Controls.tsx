const ASR_LANGUAGES = [
  { code: '', label: 'Auto' },
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
  { code: 'zh', label: 'ZH' },
  { code: 'yue', label: 'YUE' },
  { code: 'ja', label: 'JA' },
  { code: 'ko', label: 'KO' }
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
              ? 'bg-blue-500 text-white hover:bg-blue-600'
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
        <label className="block text-xs text-neutral-500 mb-1.5">Language</label>
        <div className="flex flex-wrap gap-1">
          {ASR_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => onAsrLanguageChange(l.code)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                asrLanguage === l.code
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300 border border-neutral-700'
              }`}
            >
              {l.label}
            </button>
          ))}
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

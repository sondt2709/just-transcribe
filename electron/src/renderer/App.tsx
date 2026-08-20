import { useState, useEffect, useCallback } from 'react'
import { useBackend } from './hooks/useBackend'
import { useTranscript } from './hooks/useTranscript'
import { Transcript } from './components/Transcript'
import { Controls } from './components/Controls'
import { Settings } from './components/Settings'
import { Setup } from './components/Setup'

export default function App(): JSX.Element {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [asrLanguage, setAsrLanguage] = useState('')
  const backend = useBackend()

  const handleAsrLanguageChange = useCallback(
    async (lang: string) => {
      setAsrLanguage(lang)
      if (!backend.port) return
      try {
        const res = await fetch(`http://127.0.0.1:${backend.port}/api/config`)
        if (res.ok) {
          const config = await res.json()
          await fetch(`http://127.0.0.1:${backend.port}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, asr_language: lang })
          })
        }
      } catch (err) {
        console.error('Failed to update ASR language:', err)
      }
    },
    [backend.port]
  )
  const { segments, interim, connected: wsConnected, alert, dismissAlert } = useTranscript(backend.port)

  useEffect(() => {
    window.api.getSetupStatus().then((status) => {
      setSetupComplete(status.ready)
    })

    // Open settings when triggered from tray menu
    window.api.onOpenSettings(() => {
      setShowSettings(true)
    })
  }, [])

  // Loading state
  if (setupComplete === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-400 text-sm">Loading...</div>
      </div>
    )
  }

  // Setup wizard
  if (!setupComplete) {
    return <Setup onComplete={() => setSetupComplete(true)} />
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-950">
      {/* Title bar area (draggable) */}
      <div className="h-8 flex items-center justify-center shrink-0">
        <span className="text-xs text-neutral-500 font-medium">Just Transcribe</span>
      </div>

      {/* Pipeline alert banner */}
      {alert && (
        <div
          className={`flex items-center justify-between px-4 py-2 text-sm shrink-0 no-drag ${
            alert.kind === 'error'
              ? 'bg-red-500/10 border-b border-red-500/20 text-red-300'
              : 'bg-amber-500/10 border-b border-amber-500/20 text-amber-300'
          }`}
        >
          <span>
            {alert.kind === 'error' ? 'Error: ' : 'Stall: '}
            {alert.message}
          </span>
          <button
            onClick={dismissAlert}
            className="ml-4 text-xs opacity-70 hover:opacity-100 transition-opacity"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Transcript (main area) */}
        <div className="flex-1 flex flex-col min-w-0">
          <Transcript segments={segments} interim={interim} />
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-neutral-800 flex flex-col shrink-0 no-drag">
          <Controls
            recording={backend.recording}
            connected={backend.connected && wsConnected}
            modelLoaded={backend.status?.model_loaded ?? false}
            port={backend.port}
            asrLanguage={asrLanguage}
            onAsrLanguageChange={handleAsrLanguageChange}
            onStart={() => backend.startRecording()}
            onStop={() => backend.stopRecording()}
            onSettingsClick={() => setShowSettings(true)}
          />
        </div>
      </div>

      {/* Settings dialog */}
      {showSettings && (
        <Settings
          port={backend.port}
          recording={backend.recording}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

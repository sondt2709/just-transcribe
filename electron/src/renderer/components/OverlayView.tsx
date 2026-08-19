import { useEffect, useRef, useState } from 'react'
import { useBackend } from '../hooks/useBackend'
import { useTranscript } from '../hooks/useTranscript'

const MAX_VISIBLE = 10

export function OverlayView(): JSX.Element {
  const backend = useBackend()
  const { segments, interim, connected } = useTranscript(backend.port)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [clickThrough, setClickThrough] = useState(false)

  useEffect(() => {
    window.api.getElectronConfig().then((cfg) => setClickThrough(cfg.overlay_click_through))
    window.api.onOverlayModeChanged(({ clickThrough: ct }) => setClickThrough(ct))
  }, [])

  const visibleSegments = segments.slice(-MAX_VISIBLE)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments, interim])

  const hasContent = visibleSegments.length > 0 || interim

  return (
    <div className="h-screen w-screen p-2">
    <div className="h-full w-full flex flex-col rounded-xl overflow-hidden" style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
      {/* Drag handle (hidden when click-through) */}
      {!clickThrough && (
        <div
          className="h-7 flex items-center justify-between shrink-0 cursor-move px-2"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="w-14" />
          <div className="w-8 h-1 rounded-full bg-white/20" />
          <div className="relative group" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-white/50 hover:text-white/90 hover:bg-white/10 text-[10px] font-medium transition-colors"
              onClick={() => window.api.setOverlayClickThrough(true)}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Lock
            </button>
            {/* Popover */}
            <div className="absolute right-0 top-full mt-1 w-44 px-2.5 py-1.5 rounded-lg bg-black/90 text-white/80 text-[10px] leading-snug opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
              Locks the overlay so clicks pass through to apps underneath. Unlock anytime from the tray menu.
            </div>
          </div>
        </div>
      )}

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {!hasContent && connected && (
          <div className="text-center py-4">
            <span className="text-white/40 text-xs">Listening...</span>
          </div>
        )}

        {!hasContent && !connected && (
          <div className="text-center py-4">
            <span className="text-white/30 text-xs">Not connected</span>
          </div>
        )}

        {visibleSegments.map((seg) => (
          <div key={seg.id} className="space-y-0.5">
            {/* Original text */}
            <div className="flex items-start gap-2">
              <span className="text-white/40 text-[10px] font-medium mt-0.5 shrink-0 w-10 text-right">
                {seg.speaker}
              </span>
              <span className="text-white/90 text-xs leading-relaxed">{seg.text}</span>
            </div>

            {/* Translations */}
            {Object.entries(seg.translations).map(([lang, text]) => (
              <div key={lang} className="flex items-start gap-2 ml-12">
                <span className="text-white/25 text-[10px] shrink-0">{lang.toUpperCase()}</span>
                <span className="text-white/50 text-xs leading-relaxed italic">{text}</span>
              </div>
            ))}
          </div>
        ))}

        {interim && (
          <div className="flex items-start gap-2">
            <span className="text-white/30 text-[10px] font-medium mt-0.5 shrink-0 w-10 text-right">
              {interim.source === 'mic' ? 'You' : 'Others'}
            </span>
            <span className="text-white/40 text-xs italic animate-pulse">{interim.text}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Resize handle indicator (hidden when click-through) */}
      {!clickThrough && (
        <div className="h-2 flex items-center justify-center shrink-0">
          <div className="w-4 h-0.5 rounded-full bg-white/10" />
        </div>
      )}
    </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import type { Segment } from '../hooks/useTranscript'

interface TranscriptProps {
  segments: Segment[]
  interim: { text: string; source: string } | null
}

const LANG_LABELS: Record<string, string> = {
  en: 'EN',
  vi: 'VI',
  zh: 'ZH',
  yue: 'YUE',
  ja: 'JA',
  ko: 'KO'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Transcript({ segments, interim }: TranscriptProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments, interim])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 no-drag">
      {segments.length === 0 && !interim && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-neutral-500">
            <div className="text-4xl mb-3">🎙</div>
            <div className="text-sm">Press Start to begin transcribing</div>
          </div>
        </div>
      )}

      {segments.map((seg) => (
        <div key={seg.id} className="group">
          <div className="flex items-start gap-3">
            {/* Speaker badge */}
            <div
              className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                seg.source === 'mic'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-neutral-700/50 text-neutral-400'
              }`}
            >
              {seg.speaker}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Original text */}
              <div className="flex items-baseline gap-2">
                <p className="text-neutral-100 text-sm leading-relaxed">{seg.text}</p>
                <span className="text-[10px] text-neutral-600 shrink-0">
                  {LANG_LABELS[seg.lang?.toLowerCase()] || seg.lang}
                </span>
              </div>

              {/* Translation — prominent, not secondary */}
              {seg.translation && (
                <div className="mt-1.5 px-3 py-2 rounded-md bg-indigo-500/10 border border-indigo-500/20">
                  <p className="text-sm text-indigo-200 leading-relaxed">
                    {seg.translation}
                  </p>
                </div>
              )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-neutral-600 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(seg.start)}
            </span>
          </div>
        </div>
      ))}

      {/* Interim text */}
      {interim && (
        <div className="flex items-start gap-3">
          <div className="mt-0.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 bg-neutral-800 text-neutral-500">
            {interim.source === 'mic' ? 'You' : 'Others'}
          </div>
          <p className="text-neutral-500 text-sm italic animate-pulse">
            {interim.text}
          </p>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

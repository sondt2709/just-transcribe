import { useState } from 'react'
import type { SummaryState, Utterance } from '../hooks/useTranscript'
import { SummaryPanel } from './SummaryPanel'
import { SpeakPanel } from './SpeakPanel'

type Tab = 'summary' | 'speak'

const TAB_KEY = 'aiPanelTab'

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'speak' ? 'speak' : 'summary'
  } catch {
    return 'summary'
  }
}

interface AiPanelProps {
  port: number | null
  summary: SummaryState
  summaryContext: string
  utterances: Utterance[]
  configVersion: number
  onOpenSettings: () => void
}

export function AiPanel(props: AiPanelProps): JSX.Element {
  const [tab, setTab] = useState<Tab>(readTab)
  const speaking = props.utterances.some((u) => u.status === 'playing' || u.status === 'synthesizing')

  const select = (t: Tab): void => {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // per-viewer convenience only
    }
  }

  const tabClass = (t: Tab): string =>
    `flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
      tab === t ? 'text-teal-300 border-teal-400' : 'text-neutral-500 border-transparent hover:text-neutral-300'
    }`

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-neutral-800 shrink-0">
        <button className={tabClass('summary')} onClick={() => select('summary')}>
          Summary
          {props.summary.status === 'running' && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
        </button>
        <button className={tabClass('speak')} onClick={() => select('speak')}>
          Speak
          {speaking && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
        </button>
      </div>
      {/* Both stay mounted so typed text and context survive tab switches */}
      <div className={`flex-1 min-h-0 ${tab === 'summary' ? '' : 'hidden'}`}>
        <SummaryPanel
          port={props.port}
          summary={props.summary}
          context={props.summaryContext}
          configVersion={props.configVersion}
        />
      </div>
      <div className={`flex-1 min-h-0 ${tab === 'speak' ? '' : 'hidden'}`}>
        <SpeakPanel
          port={props.port}
          utterances={props.utterances}
          configVersion={props.configVersion}
          onOpenSettings={props.onOpenSettings}
        />
      </div>
    </div>
  )
}

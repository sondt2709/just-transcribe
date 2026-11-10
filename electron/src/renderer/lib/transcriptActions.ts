import {
  defaultFileName,
  formatSummaryMarkdown,
  formatSummaryText,
  formatTranscriptMarkdown,
  formatTranscriptText,
  type HistorySegment,
  type Summary
} from './exportFormat'

export { formatTranscriptText }

async function fetchHistory(port: number): Promise<{ segments: HistorySegment[]; targetOrder: string[] }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/transcript`)
  if (!res.ok) throw new Error(`Failed to fetch transcript: ${res.status}`)
  const { segments } = (await res.json()) as { segments: HistorySegment[] }

  let targetOrder: string[] = []
  try {
    const cfgRes = await fetch(`http://127.0.0.1:${port}/api/config`)
    if (cfgRes.ok) {
      const cfg = await cfgRes.json()
      targetOrder = [cfg.preferred_language, cfg.preferred_language_2].filter(Boolean)
    }
  } catch {
    // fall back to insertion order
  }
  return { segments, targetOrder }
}

/** Copy the full backend transcript history to the clipboard. Returns false if empty. */
export async function copyTranscript(port: number): Promise<boolean> {
  const { segments, targetOrder } = await fetchHistory(port)
  if (!segments.length) return false
  await navigator.clipboard.writeText(formatTranscriptText(segments, targetOrder))
  return true
}

/** Save the full transcript (original + translations) through the Save dialog. */
export async function exportTranscript(port: number): Promise<{ saved: boolean; path?: string }> {
  const { segments, targetOrder } = await fetchHistory(port)
  if (!segments.length) return { saved: false }
  return window.api.saveTextFile({
    defaultName: defaultFileName('transcript'),
    markdown: formatTranscriptMarkdown(segments, targetOrder),
    text: formatTranscriptText(segments, targetOrder)
  })
}

/** Save the summary through the Save dialog. */
export async function exportSummary(
  summary: Summary,
  updatedAt: number | null
): Promise<{ saved: boolean; path?: string }> {
  return window.api.saveTextFile({
    defaultName: defaultFileName('summary'),
    markdown: formatSummaryMarkdown(summary, updatedAt),
    text: formatSummaryText(summary, updatedAt)
  })
}

/** Clear backend transcript history; all windows reset via the broadcast "clear" event. */
export async function clearTranscript(port: number): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/api/transcript/clear`, { method: 'POST' })
}

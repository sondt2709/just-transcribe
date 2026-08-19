interface HistorySegment {
  id: number
  text: string
  source: string
  speaker: string
  lang: string
  start: number
  end: number
  wall_start: number
  translations: Record<string, string>
}

function formatWallTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function orderedLangs(translations: Record<string, string>, targetOrder: string[]): string[] {
  const langs = Object.keys(translations)
  const inOrder = targetOrder.filter((l) => langs.includes(l))
  const rest = langs.filter((l) => !targetOrder.includes(l))
  return [...inOrder, ...rest]
}

export function formatTranscriptText(segments: HistorySegment[], targetOrder: string[]): string {
  return segments
    .map((seg) => {
      const lines = [`[${formatWallTime(seg.wall_start)}] ${seg.speaker} (${seg.lang}): ${seg.text}`]
      for (const lang of orderedLangs(seg.translations, targetOrder)) {
        lines.push(`    ${lang}: ${seg.translations[lang]}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

/** Copy the full backend transcript history to the clipboard. Returns false if empty. */
export async function copyTranscript(port: number): Promise<boolean> {
  const res = await fetch(`http://127.0.0.1:${port}/api/transcript`)
  if (!res.ok) throw new Error(`Failed to fetch transcript: ${res.status}`)
  const { segments } = (await res.json()) as { segments: HistorySegment[] }
  if (!segments.length) return false

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

  await navigator.clipboard.writeText(formatTranscriptText(segments, targetOrder))
  return true
}

/** Clear backend transcript history; all windows reset via the broadcast "clear" event. */
export async function clearTranscript(port: number): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/api/transcript/clear`, { method: 'POST' })
}

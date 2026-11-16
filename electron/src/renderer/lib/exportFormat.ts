// Pure formatters for copy/export. No browser or Electron APIs here, so
// `node --test` can import this file directly.

export interface HistorySegment {
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

export type SummaryItemType = 'info' | 'action' | 'question'

export interface SummaryItem {
  type: SummaryItemType
  speaker: 'You' | 'Others'
  text: string
}

export interface SuggestedAnswer {
  for: string
  answer: string
}

export interface Summary {
  summary: string
  items: SummaryItem[]
  next_actions: string[]
  suggested_answers: SuggestedAnswer[]
}

const pad = (n: number): string => n.toString().padStart(2, '0')

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatWallTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  return `${formatDate(d)} ${formatClock(d)}`
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

export function formatTranscriptMarkdown(segments: HistorySegment[], targetOrder: string[]): string {
  const lines = ['# Transcript', '']
  if (segments.length) {
    lines.push(formatWallTime(segments[0].wall_start), '')
  }
  for (const seg of segments) {
    const clock = formatClock(new Date(seg.wall_start * 1000))
    lines.push(`- **[${clock}] ${seg.speaker}** (${seg.lang}): ${seg.text}`)
    for (const lang of orderedLangs(seg.translations, targetOrder)) {
      lines.push(`  - ${lang}: ${seg.translations[lang]}`)
    }
  }
  return lines.join('\n') + '\n'
}

export const ITEM_LABELS: Record<SummaryItemType, string> = {
  info: 'Info',
  action: 'Action',
  question: 'Question'
}

export function formatSummaryMarkdown(summary: Summary, updatedAt: number | null): string {
  const lines = ['# Conversation summary', '']
  if (updatedAt) lines.push(`_Updated ${formatWallTime(updatedAt)}_`, '')
  lines.push('## Summary', '', summary.summary || '-', '')
  lines.push('## Items', '')
  if (summary.items.length) {
    for (const it of summary.items) lines.push(`- **${ITEM_LABELS[it.type]}** (${it.speaker}): ${it.text}`)
  } else lines.push('-')
  lines.push('', '## Next actions', '')
  if (summary.next_actions.length) for (const a of summary.next_actions) lines.push(`- ${a}`)
  else lines.push('-')
  lines.push('', '## Suggested answers', '')
  if (summary.suggested_answers.length) {
    for (const a of summary.suggested_answers) {
      lines.push(a.for ? `- **${a.for}**` : '-')
      lines.push(`  ${a.answer}`)
    }
  } else lines.push('-')
  return lines.join('\n') + '\n'
}

export function formatSummaryText(summary: Summary, updatedAt: number | null): string {
  const lines = ['CONVERSATION SUMMARY']
  if (updatedAt) lines.push(`Updated ${formatWallTime(updatedAt)}`)
  lines.push('', 'SUMMARY', summary.summary || '-', '', 'ITEMS')
  if (summary.items.length) {
    for (const it of summary.items) lines.push(`- [${ITEM_LABELS[it.type]}] ${it.speaker}: ${it.text}`)
  } else lines.push('-')
  lines.push('', 'NEXT ACTIONS')
  if (summary.next_actions.length) for (const a of summary.next_actions) lines.push(`- ${a}`)
  else lines.push('-')
  lines.push('', 'SUGGESTED ANSWERS')
  if (summary.suggested_answers.length) {
    for (const a of summary.suggested_answers) {
      if (a.for) lines.push(`- ${a.for}`)
      lines.push(`  -> ${a.answer}`)
    }
  } else lines.push('-')
  return lines.join('\n') + '\n'
}

/** `<prefix>-YYYYMMDD-HHMM.md` in local time. */
export function defaultFileName(prefix: string, now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${prefix}-${stamp}.md`
}

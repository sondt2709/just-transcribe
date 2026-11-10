import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultFileName,
  formatSummaryMarkdown,
  formatSummaryText,
  formatTranscriptMarkdown,
  formatTranscriptText,
  type HistorySegment,
  type Summary
} from './exportFormat.ts'

// 2026-08-20 14:32:05 local time
const T = new Date(2026, 7, 20, 14, 32, 5).getTime() / 1000

function seg(over: Partial<HistorySegment>): HistorySegment {
  return {
    id: 1,
    text: 'Hi',
    source: 'speaker',
    speaker: 'Others',
    lang: 'en',
    start: 0,
    end: 1,
    wall_start: T,
    translations: {},
    ...over
  }
}

const SUMMARY: Summary = {
  summary: 'Beta ships Friday.',
  items: [
    { type: 'info', speaker: 'Others', text: 'QA needs two days' },
    { type: 'action', speaker: 'You', text: 'Write release notes' },
    { type: 'question', speaker: 'Others', text: 'SSO in beta?' }
  ],
  next_actions: ['Send bug list', 'Reply about SSO'],
  suggested_answers: [{ for: 'SSO in beta?', answer: 'Not in the beta.' }]
}

test('markdown transcript: header, segment line, nested translations in target order', () => {
  const md = formatTranscriptMarkdown(
    [seg({ translations: { ja: 'こんにちは', vi: 'Chào' } }), seg({ id: 2, speaker: 'You', text: 'Yes', wall_start: T + 3 })],
    ['vi', 'ja']
  )
  assert.equal(
    md,
    [
      '# Transcript',
      '',
      '2026-08-20 14:32:05',
      '',
      '- **[14:32:05] Others** (en): Hi',
      '  - vi: Chào',
      '  - ja: こんにちは',
      '- **[14:32:08] You** (en): Yes',
      ''
    ].join('\n')
  )
})

test('text transcript keeps the clipboard format', () => {
  assert.equal(
    formatTranscriptText([seg({ translations: { vi: 'Chào' } })], ['vi']),
    '[2026-08-20 14:32:05] Others (en): Hi\n    vi: Chào'
  )
})

test('summary markdown has the 4 block headings and content', () => {
  const md = formatSummaryMarkdown(SUMMARY, T)
  const order = ['## Summary', '## Items', '## Next actions', '## Suggested answers'].map((h) => md.indexOf(h))
  assert.ok(order.every((i) => i > 0))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.match(md, /_Updated 2026-08-20 14:32:05_/)
  assert.match(md, /- \*\*Action\*\* \(You\): Write release notes/)
  assert.match(md, /- \*\*Question\*\* \(Others\): SSO in beta\?/)
  assert.match(md, /- Send bug list\n- Reply about SSO/)
  assert.match(md, /- \*\*SSO in beta\?\*\*\n {2}Not in the beta\./)
})

test('summary text format', () => {
  const txt = formatSummaryText(SUMMARY, null)
  assert.match(txt, /^CONVERSATION SUMMARY\n\nSUMMARY\nBeta ships Friday\./)
  assert.match(txt, /- \[Info\] Others: QA needs two days/)
  assert.match(txt, / {2}-> Not in the beta\./)
})

test('empty summary blocks render a dash', () => {
  const md = formatSummaryMarkdown({ summary: '', items: [], next_actions: [], suggested_answers: [] }, null)
  assert.match(md, /## Items\n\n-\n/)
})

test('default file name uses local time', () => {
  assert.equal(defaultFileName('transcript', new Date(2026, 10, 11, 9, 5)), 'transcript-20261111-0905.md')
})

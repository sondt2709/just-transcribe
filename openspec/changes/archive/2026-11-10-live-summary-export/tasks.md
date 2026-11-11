## 1. Config

- [x] 1.1 Add `summary_mode`, `summary_debounce_s`, `summary_min_segments`, `summary_window_s`, `summary_overlap_s`, `summary_prompt` to `AppConfig` (`to_dict`, `from_dict` with defaults)
- [x] 1.2 Test: an old config dict without summary keys loads with the defaults, and `to_dict` round-trips

## 2. Summary service (Python)

- [x] 2.1 Create `pipeline/summarize.py`: line format (`[HH:MM:SS] You|Others: text`, original only), full/rolling/backlog window builder
- [x] 2.2 Add prompt build: default template, `{{content}}`/`{{context}}`/`{{language}}` replacement, append content when the placeholder is missing, fixed system message with the JSON contract
- [x] 2.3 Add lenient JSON parse and normalize (code fences, unknown type dropped, unknown speaker → `Others`)
- [x] 2.4 Add `SummaryService`: LLM call through the translation settings, status/state, single-flight run with one pending rerun, debounce timer, min-segment check, `reset()`, `set_context()` (20,000-character cap), tracing events `summary_call`/`summary_done`
- [x] 2.5 Tests: window builder (full, rolling with overlap, backlog windows), translations excluded, placeholders, parse cases, debounce restart, min segments, no parallel runs, LLM not configured

## 3. Backend API

- [x] 3.1 Create `SummaryService` in the lifespan; update its LLM and summary settings in `PUT /api/config`
- [x] 3.2 Call `notify_segment` from `_on_segment`; reset the summary in `POST /api/transcript/clear`
- [x] 3.3 Add `GET /api/summary`, `POST /api/summary/run`, `PUT /api/summary/context`; broadcast `summary` events
- [x] 3.4 Test the endpoints with FastAPI `TestClient` and a fake LLM transport

## 4. Export (Electron)

- [x] 4.1 Add IPC `save-text-file` in `main/index.ts` (Save dialog, `.md`/`.txt` filters, choose content by extension) and `saveTextFile` in `preload/index.ts`
- [x] 4.2 Create `lib/exportFormat.ts` (pure formatters: `formatTranscriptMarkdown`, `formatSummaryMarkdown`, `formatSummaryText`, default file names) and `exportTranscript`/`exportSummary` in `lib/transcriptActions.ts`
- [x] 4.3 Tests (`node --test`): Markdown transcript format, summary Markdown/text format
- [x] 4.4 Add an Export button to the Transcript actions in `Controls.tsx` (disabled when empty)

## 5. Summary UI (Electron)

- [x] 5.1 Handle the `summary` WebSocket event in `useTranscript.ts`; fetch `GET /api/summary` on connect
- [x] 5.2 Create `SummaryPanel.tsx`: status line, Summarize now, Copy, Export, context box with Load file, 4 blocks
- [x] 5.3 Add the panel column and the "Summary" toggle (`localStorage`) in `App.tsx` and `Controls.tsx`
- [x] 5.4 Add the "AI Summary" section to `Settings.tsx` (mode, debounce, min segments, window minutes, overlap, prompt with Reset to default)

## 6. Verify

- [x] 6.1 `cd python && uv run pytest` and `cd electron && npm test && npm run build` pass
- [x] 6.2 Real session in the dev app with `Others` lines from `say` (speaker capture); auto summary and rolling update appear; capture screenshots and the real `GET /api/summary` responses (`You` lines through the mic were not possible: the Mac output was muted)
- [x] 6.3 Export the summary through the Save dialog and read the file; run the transcript formatters on the real `/api/transcript` data

# Tasks: trace-viewer-ui

## 1. Backend session API

- [x] 1.1 `GET /api/sessions` in `server.py`: scan `SESSIONS_DIR`, per-session metadata (name, event_count, duration_s, stalls, errors, wav_count, size_bytes), newest first, skip unreadable
- [x] 1.2 `GET /api/sessions/{name}/events`: validate name (`^\d{8}-\d{6}$`), parse JSONL skipping bad lines, support `types` include / `-` exclude filter, 404 on unknown
- [x] 1.3 `GET /api/sessions/{name}/audio/{filename}`: FileResponse with `audio/wav`, resolve-inside-`segments/` + `.wav` suffix check, 404 otherwise

## 2. Viewer UI

- [x] 2.1 `hooks/useSessions.ts`: fetch session list + events (with refresh)
- [x] 2.2 `components/TraceViewer.tsx`: full-screen overlay (Settings pattern), left session list with badges, right event table
- [x] 2.3 Event table: color-coded type chips, time/source/summary columns, row-click JSON expansion
- [x] 2.4 Filters: type multi-toggle, text search, heartbeat toggle (off default), refresh button
- [x] 2.5 Summary header: totals, ASR p50/max latency, translate ok/err, stall count (from unfiltered events)
- [x] 2.6 Inline `<audio>` for `wav` fields and stall `ring_dumps`
- [x] 2.7 "Debug Sessions" button in `Settings.tsx` Debugging section opening the viewer

## 3. Verify

- [x] 3.1 Endpoint tests via curl against a real session dir: list, events, `-heartbeat` filter, WAV serving, traversal attempts return 404
- [x] 3.2 `npm run build` passes
- [x] 3.3 Manual: open viewer on session `20260820-091903` — summary stats correct, filters work, WAV playback works

## 4. Transcript view

- [x] 4.1 Build transcript model in `TraceViewer.tsx`: final `asr_done` rows + wav from `asr_call` (same trace_id, kind=final) + translations from `translate_done` + dedup markers from `dedup_drop`
- [x] 4.2 Events/Transcript toggle; transcript rows with time, speaker, lang badge, text, translations, inline audio player
- [x] 4.3 `npm run build` passes; manual check on a debug_audio session

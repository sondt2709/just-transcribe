# Tasks: transcript-clear-copy

## 1. Backend — wall-clock time + history

- [x] 1.1 Capture `wall_epoch = time.time()` at recording start in `orchestrator.py` and expose `wall_start` on emitted segments
- [x] 1.2 Add `transcript` history list to `AppState`; append in `_on_segment`, merge translations in `_on_translation` (no-op on unknown segment id), include `wall_start` in the segment WS payload
- [x] 1.3 Add `GET /api/transcript` returning full history with translations
- [x] 1.4 Add `POST /api/transcript/clear` that empties history and broadcasts `{"type": "clear"}`

## 2. Frontend — shared transcript actions

- [x] 2.1 Handle `clear` WS event in `useTranscript.ts` (reset segments + interim); store `wall_start` on segments
- [x] 2.2 Create shared helper (`lib/transcriptActions.ts`): fetch history, format plain text (`[YYYY-MM-DD HH:MM:SS] Speaker (lang): text` + indented translations in config target-language order), write to clipboard; and a `clearTranscript(port)` POST helper

## 3. Main window UI

- [x] 3.1 Add Copy and Clear icon buttons to `Controls.tsx` with "Copied ✓" transient state on copy

## 4. Overlay UI

- [x] 4.1 Add Copy and Clear icon buttons to the overlay drag-handle bar in `OverlayView.tsx` (hidden in click-through mode), wired to the same helpers

## 5. Verification

- [x] 5.1 Manual test: record, verify copy output format (timestamp/speaker/lang/translations) identical from both windows; clear syncs both windows and recording continues

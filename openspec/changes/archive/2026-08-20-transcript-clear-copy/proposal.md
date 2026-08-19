# Proposal: transcript-clear-copy

## Why

Users cannot clear accumulated transcript content or export it. Long sessions pile up stale segments in both the main window and the overlay, and there is no way to get the transcript out of the app (e.g., to paste into notes). Additionally, each window keeps its own independent segment list, so any clear/copy feature built purely client-side would behave inconsistently between windows.

## What Changes

- Backend keeps an in-memory transcript history (segments + merged translations) as the single source of truth.
- Backend adds a wall-clock timestamp (`wall_start`, unix epoch) to each segment so exports can show real time instead of relative time.
- New HTTP endpoints: `GET /api/transcript` (full history) and `POST /api/transcript/clear` (empty history + broadcast `{"type": "clear"}` to all WebSocket clients).
- Main window UI: Copy and Clear buttons.
- Overlay UI: Copy and Clear icon buttons in the drag-handle bar (hidden when click-through is locked, same as the Lock button).
- Copy produces plain-text format: `[YYYY-MM-DD HH:MM:SS] Speaker (lang): text`, with translations indented below each segment in config target-language order.
- Clear wipes the display in every window simultaneously (via broadcast) but does not stop recording.

## Capabilities

### New Capabilities

- `transcript-actions`: Clearing the transcript and copying/exporting the full transcript as plain text, available from both the main window and the overlay.

### Modified Capabilities

- `backend-server`: WebSocket segment events gain a `wall_start` field; new `clear` broadcast event; new transcript history + clear HTTP endpoints.
- `overlay-window`: Drag-handle bar gains Copy and Clear controls alongside the Lock button.

## Impact

- `python/src/just_transcribe/server.py` — history state, new endpoints, `wall_start` in segment payload, `clear` broadcast.
- `python/src/just_transcribe/pipeline/orchestrator.py` — capture wall-clock epoch at recording start.
- `electron/src/renderer/hooks/useTranscript.ts` — handle `clear` event, store `wall_start`.
- `electron/src/renderer/App.tsx`, `components/Transcript.tsx` or `components/Controls.tsx` — main-window buttons.
- `electron/src/renderer/components/OverlayView.tsx` — overlay buttons.
- No config changes, no packaging changes, no breaking changes (new WS field is additive).

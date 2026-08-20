# Trace Viewer UI

## Why

Pipeline tracing (change `pipeline-tracing-stall-fixes`) writes `events.jsonl` + WAV files per session, but inspecting them requires jq/terminal work. A built-in viewer makes diagnosis accessible in seconds — pick a session, filter events, listen to the exact audio a segment was transcribed from.

## What Changes

- **Backend session API** (FastAPI, additive):
  - `GET /api/sessions` — list session directories with metadata (name, event count, duration, stall/error counts, audio file count, size).
  - `GET /api/sessions/{name}/events` — parsed events as JSON array (optional `?types=` filter).
  - `GET /api/sessions/{name}/audio/{filename}` — serve a session WAV with `audio/wav` content type. Session name and filename validated against path traversal.
- **Trace viewer UI** in the Electron renderer:
  - Entry point: "Debug Sessions" button (Settings → Debugging section).
  - Session list with metadata; newest first; stall/error badges.
  - Event table: time, event type (color-coded chip), source, key fields summary; row expands to full JSON.
  - Filters: event-type multi-toggle, free-text search; heartbeats hidden by default (they dominate volume).
  - Summary header per session: totals, ASR latency p50/max, translation ok/error counts, stalls.
  - Inline `<audio>` player for any event with a `wav` field and for stall ring dumps.

## Capabilities

### New Capabilities
- `trace-viewer`: session listing/inspection UI and its backend API.

### Modified Capabilities
<!-- none — backend-server endpoints are additive; trace-viewer spec owns them. No existing requirement changes. -->

## Impact

- Python: `server.py` (3 new read-only endpoints, no pipeline interaction).
- Electron renderer: new `components/TraceViewer.tsx`, small hook for fetching; Settings button.
- No config changes, no new dependencies (WAV served over existing HTTP port; `<audio>` is native).
- Read-only over existing session files — zero effect on recording pipeline.

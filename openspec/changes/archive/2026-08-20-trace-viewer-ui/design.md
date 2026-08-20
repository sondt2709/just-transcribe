# Design: Trace Viewer UI

## Context

Sessions live at `~/.just-transcribe/sessions/<ts>/` with `events.jsonl` (always) and `segments/*.wav` (when debug_audio). Renderer has no filesystem access (contextIsolation); backend FastAPI already serves the renderer on a local port. Event volume: ~3k events / 11 min observed, heartbeats ≈ 20% of lines, file ~700KB/hour.

## Goals / Non-Goals

**Goals:**
- Inspect any session in-app: filter events, expand payloads, play WAVs.
- Zero impact on the recording pipeline; read-only endpoints.

**Non-Goals:**
- No live tail of the active session (open a completed or in-progress session manually; refresh button re-fetches).
- No waveform rendering, no cross-session aggregation/analytics.
- No pagination/virtualization beyond hiding heartbeats — files are sub-MB; revisit if sessions grow.
- No editing/deleting sessions from the UI.

## Decisions

### D1: Serve sessions via FastAPI, not Electron IPC
Renderer already talks HTTP to the backend; adding IPC + preload API for file reads duplicates a channel. Endpoints are read-only and localhost-bound like the rest of the API. Alternative (main-process fs + IPC) rejected: more moving parts, no benefit.

### D2: Whole-file event fetch, client-side filtering
`events.jsonl` is small (≤ ~1MB/hour). One `GET /events` returning a JSON array keeps the UI simple; filtering/search happens in React state. Optional `?types=` server filter exists for cheap heartbeat exclusion (`?types=-heartbeat` style: prefix `-` excludes). Alternative (server-side pagination) rejected as premature.

### D3: Session metadata computed on list
`GET /api/sessions` scans each session dir: event count from line count, duration from first/last `ts`, stall/error counts via line scan, WAV count from `segments/`. Linear scan of ≤20 small files is fast (<50ms). No index file maintained.

### D4: Path safety
Session `name` must match `^[0-9]{8}-[0-9]{6}$`; audio `filename` must resolve inside the session's `segments/` dir (resolve + `is_relative_to` check) and end in `.wav`. Reject otherwise with 404.

### D5: UI as modal view like Settings
`TraceViewer.tsx` renders as a full-screen overlay (same pattern as `Settings.tsx`), opened from Settings → Debugging "Debug Sessions" button. Two panes: session list (left), event table (right). Event-type chips colored by family (vad_* teal, asr_* blue, translate_* purple, stall/error red, gating/dedup amber, heartbeat gray). Row click toggles pretty-printed JSON. `wav` fields render a native `<audio controls>` element pointed at the audio endpoint.

### D6: Heartbeats hidden by default
Toggle "Show heartbeats" off by default; summary header derives stats (ASR p50/max latency, translate ok/err, stall count) from the full event array regardless of filter.

## Risks / Trade-offs

- [Large session files in very long recordings] → client-side approach degrades gracefully; if a file exceeds a few MB, add `?types=` exclusion of heartbeat at fetch time (already supported) — and virtualization later if ever needed.
- [Serving WAVs while recording is active] → files are append-complete once written (final segments); reading them is safe. Active session's events.jsonl grows between refreshes — refresh button re-fetches.
- [Path traversal on audio endpoint] → D4 validation; also endpoints bind to 127.0.0.1 like the rest of the API.

## Migration Plan

Additive only. No config, no data migration. Rollback = revert commit.

## Open Questions

None.

# Design: transcript-clear-copy

## Context

The backend (`server.py`) is broadcast-only: segments, interims, and translations are pushed to all WebSocket clients and immediately forgotten. The main window and overlay window each run their own `useTranscript` hook with an independent `segments[]` array. The two windows are mutually exclusive (only one visible at a time), but both keep WebSocket connections and accumulate state independently — a window (re)opened mid-session has an incomplete transcript. Segment timestamps (`start`/`end`) are monotonic seconds relative to recording start (`time.monotonic()` in `orchestrator.py`); no wall-clock time exists anywhere in the pipeline.

## Goals / Non-Goals

**Goals:**
- Clear the transcript everywhere (all windows) with one action.
- Copy the entire transcript — regardless of which window triggers it — as plain text with real (wall-clock) timestamps, speaker, language, original text, and all translations.
- Keep recording running through a clear.

**Non-Goals:**
- Persisting transcript history to disk or across backend restarts.
- Export formats other than plain text (SRT, JSON, CSV).
- Replaying history to newly connected WebSocket clients (natural follow-up, out of scope).
- Tray-menu clear/copy actions.

## Decisions

### 1. Backend-held transcript history (single source of truth)

`AppState` gains a `transcript: list[dict]` plus a lock-free append/merge path (all mutations happen on the event-loop thread via the existing broadcast queue pattern). `_on_segment` appends; `_on_translation` merges `translations[target_lang]` into the matching entry. Copy fetches `GET /api/transcript` so the result is identical from either window.

*Alternative considered:* client-side copy from local `segments[]` — rejected because each window's state can be incomplete (window opened mid-session) and clear/copy would behave inconsistently between windows.

### 2. Wall-clock timestamps computed from a recording-start epoch

Orchestrator records `wall_epoch = time.time()` at the same moment it records `time.monotonic()` at recording start. Segment payloads (WS broadcast and history entries) gain `wall_start = wall_epoch + segment.start` (unix epoch seconds, float). Frontend formats as local `YYYY-MM-DD HH:MM:SS`.

*Alternative considered:* frontend stamping `Date.now()` on message arrival — rejected: skewed by ASR latency (1–3 s) and diverges between windows.

### 3. Clear = HTTP action + WS broadcast

`POST /api/transcript/clear` empties `state.transcript` and broadcasts `{"type": "clear"}`. Every connected window resets its local `segments[]` and `interim` on receiving the event, including the hidden window. Recording is untouched. Segment ID counter is NOT reset (IDs stay monotonically increasing; simpler, avoids translation-merge races against in-flight segments).

*Alternative considered:* Electron IPC fan-out between windows — rejected: the WS channel already reaches every window and keeps backend state authoritative.

### 4. Plain-text export format, rendered in the frontend

Frontend fetches `GET /api/transcript` (JSON) and renders:

```
[2026-08-20 14:32:05] You (en): Hello everyone, let's get started
    vi: Chào mọi người, bắt đầu nào
    ja: 皆さんこんにちは、始めましょう
```

Translations ordered by the config's target-language order (fetched from `/api/config`), falling back to insertion order for languages not in config. Interim text excluded. Clipboard write via `navigator.clipboard.writeText` (works in both renderer windows).

*Alternative considered:* server-side TXT rendering — rejected: locale-local time formatting belongs in the client, and JSON keeps the endpoint reusable.

### 5. UI placement

- **Main window:** Copy and Clear icon buttons in a small action row in the `Controls` sidebar (transcript area stays clean). Copy shows a transient "Copied ✓" state; Clear acts immediately (no modal).
- **Overlay:** Copy and Clear icon buttons in the existing drag-handle bar next to the Lock button, hidden in click-through mode like the rest of the chrome.

## Risks / Trade-offs

- [History lost on backend restart] → acceptable; matches current app behavior (transcript is session-scoped).
- [Unbounded memory growth of `state.transcript`] → negligible in practice (hours of speech ≈ hundreds of KB); no cap for now.
- [Clear while a translation is in flight] → the late `translate` event references a segment absent from history and local state; both merge paths must no-op on unknown IDs (frontend already does via `map`).
- [Clipboard API failure in overlay (unfocused window)] → `navigator.clipboard.writeText` may require focus; fallback to Electron `clipboard.writeText` via preload IPC if testing shows failures.

## Open Questions

None — format and behavior decisions above were reviewed during exploration.

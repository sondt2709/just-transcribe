# Pipeline Tracing & Stall Fixes

## Why

The app can go silent for 10+ seconds (no transcript, no translation) with zero user-visible signal and no way to diagnose the cause. Root causes found by code inspection: a single global ASR lock serializes all transcription (a hung remote ASR call — 30s timeout + retry — freezes interim, final, and even Stop), the VAD loop blocks on ASR inline so audio consumption stops, and the UI only renders positive events (errors and stalls are invisible). There is no structured trace of pipeline decisions to confirm any diagnosis on a real occurrence.

## What Changes

- **Pipeline tracing**: new `tracing.py` module writing structured JSONL events per recording session (`~/.just-transcribe/sessions/<ts>/events.jsonl`): VAD transitions, gating/dedup decisions, ASR calls (latency, lock wait), LLM calls (latency, status), broadcasts. Always on (lightweight).
- **Heartbeat**: 1/s snapshot event of every stage (chunk counters, RMS, VAD state, gate state, ASR lock hold time, in-flight tasks, last interim/segment age, WS client count).
- **Stall watchdog**: audio flowing but no interim/segment for 10s → WARN trace event + `stall` WebSocket event.
- **Audio debug recording (opt-in config)**: WAV per ASR call + rolling ring buffer (last 60s per source) dumped on stall. Off by default.
- **Stall fixes**:
  - ASR lock moves into the local (MLX) provider only; remote ASR calls run without a global lock.
  - VAD loop no longer awaits ASR inline — final segments dispatched to a per-source worker queue (preserves per-source ordering, decouples audio consumption from ASR latency).
  - `_interim_busy` becomes per-source.
  - `stop()` no longer hangs on a stuck ASR call (bounded wait on flush).
- **ASR call timeout config**: `asr_timeout_s` config field (default 10s, previously hard-coded 30s), applied to remote ASR requests.
- **UI stall/error visibility**: renderer handles `error` and `stall` events with a visible banner instead of `console.error` only.

## Capabilities

### New Capabilities
- `pipeline-tracing`: structured JSONL session trace, heartbeat, stall watchdog, opt-in audio debug recording.

### Modified Capabilities
- `transcription-pipeline`: non-blocking VAD loop (finals via worker queue), per-source interim busy state, ASR lock scoped to local provider, bounded stop.
- `remote-asr`: configurable request timeout (`asr_timeout_s`, default 10s), no global lock.
- `app-config`: new fields `asr_timeout_s`, `debug_audio` (opt-in WAV recording).
- `backend-server`: new `stall` WebSocket event type; trace hooks around broadcasts.
- `electron-shell`: renderer shows stall/error banner.

## Impact

- Python: `pipeline/orchestrator.py` (major rework of loops/locking), `pipeline/asr.py`, `pipeline/asr_remote.py`, `pipeline/translate.py` (trace hooks), `server.py`, `config.py`, new `tracing.py`.
- Electron renderer: `hooks/useTranscript.ts`, `components/Transcript.tsx` (or `App.tsx`) for banner.
- New on-disk artifact: `~/.just-transcribe/sessions/` (bounded: sessions pruned, keep last N).
- No breaking API changes; new WS event type is additive.

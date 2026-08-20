# Tasks: pipeline-tracing-stall-fixes

## 1. Config & timeout

- [x] 1.1 Add `asr_timeout_s` (float, default 10.0) and `debug_audio` (bool, default false) to `AppConfig` (dataclass, to_dict, from_dict)
- [x] 1.2 Pass `asr_timeout_s` into `RemoteASREngine`; replace hard-coded `_REQUEST_TIMEOUT_S` usage; apply on provider re-init in `server.py`
- [x] 1.3 Add ASR timeout numeric input + debug-audio toggle to `Settings.tsx` (remote section for timeout)

## 2. Tracing core

- [x] 2.1 Create `tracing.py`: `SessionTracer` with session dir creation, `trace(event, **fields)` JSONL append (buffered, timer flush), `trace_id` helper, session pruning (keep 20), WAV save helper, per-source 60s ring buffer with dump
- [x] 2.2 Wire tracer lifecycle in `server.py`: create on `/api/start`, close on `/api/stop`; pass into orchestrator
- [x] 2.3 Add trace calls: VAD transitions incl. short-segment drop (`vad.py` returns drop info or orchestrator infers), mic gating, dedup drop with similarity, broadcast events
- [x] 2.4 Add ASR call tracing (audio_s, lock_wait_s, latency_s, provider, text/lang/error, wav path when debug_audio) for both interim and final paths
- [x] 2.5 Add translation call tracing in `translate.py` (segment_id, target_lang, latency, status; full prompt only when debug_audio)

## 3. Stall fixes (orchestrator rework)

- [x] 3.1 Move GPU serialization into `ASREngine` (internal `threading.Lock` around `generate`); remove `_asr_lock` from orchestrator; expose lock-hold time for heartbeat
- [x] 3.2 Replace inline `await _transcribe_final` with per-source bounded `asyncio.Queue` (maxsize 8) + worker task per source; drop-oldest on overflow with `segment_dropped` event
- [x] 3.3 Make `_interim_busy` per-source
- [x] 3.4 Bounded `stop()`: flush VAD into queues, `asyncio.wait_for` workers ≤10s, cancel on timeout with `stop_timeout` event; also await/cancel in-flight translation tasks
- [x] 3.5 Track ring buffer feed in `_vad_loop` (raw chunks per source) when debug_audio

## 4. Heartbeat & watchdog

- [x] 4.1 Heartbeat task (1s): chunk counters/RMS per source, VAD state, gate state, local lock hold, in-flight ASR/translate counts, last interim/segment age, ws_clients
- [x] 4.2 Watchdog rule on each beat (speech seen + no output ≥10s → `stall` trace event + WS broadcast + ring dump if debug_audio; ≥30s re-fire cooldown)

## 5. UI visibility

- [x] 5.1 `useTranscript.ts`: add `alert` state from `error`/`stall` events; auto-clear on segment/interim; expose dismiss
- [x] 5.2 Render dismissible banner in `App.tsx` (warning style for stall, error style for error)

## 6. Verify

- [x] 6.1 Python compiles + existing tests pass (`uv run python -m compileall`, run test suite if present)
- [x] 6.2 Manual: start recording, speak → check `events.jsonl` has full trace chain with shared trace_id; sessions pruned
- [x] 6.3 Manual stall drill: point remote ASR at unreachable/hanging URL → interim keeps flowing for other source, stall banner appears ≤10s, stop completes ≤10s
- [x] 6.4 `debug_audio=true` → WAVs per ASR call + ring dump on stall; `false` → no WAVs
- [x] 6.5 Electron typecheck/build (`npm run build` or tsc) passes

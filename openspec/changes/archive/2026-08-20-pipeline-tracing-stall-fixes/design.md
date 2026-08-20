# Design: Pipeline Tracing & Stall Fixes

## Context

Pipeline: audio chunks → Silero VAD → ASR (local MLX or remote HTTP) → LLM translation → WebSocket → React UI. Observed bug: 10s+ blackout with no UI signal. Code inspection identified: global `_asr_lock` in `PipelineOrchestrator` serializes interim + final × mic + speaker; `_vad_loop` awaits `_transcribe_final` inline (stops consuming the unbounded audio queue during ASR stalls); remote ASR hard-codes 30s timeout + 1 retry (worst-case ~63s serial hold); UI renders only positive events. Only observability today is `backend.log` with sparse unstructured log lines.

## Goals / Non-Goals

**Goals:**
- Diagnose any pipeline stall from one file (`events.jsonl`) within one occurrence.
- Surface stalls/errors to the user in the UI in real time.
- Remove the lock convoy: one slow ASR call must not freeze the pipeline or Stop.
- Configurable, shorter remote ASR timeout.

**Non-Goals:**
- No cloud telemetry (Sentry/Firebase/SigNoz) — local files only.
- No OpenTelemetry dependency (trace schema kept OTel-translatable for later).
- No fix for Silero VAD running synchronously on the event loop (fast in practice; revisit if heartbeats show loop blocking).
- No trace viewer UI — files queryable with jq/DuckDB; existing UI only gets the stall/error banner.
- No change to VAD algorithm, dedup algorithm, or half-duplex strategy (only tracing of their decisions).

## Decisions

### D1: Custom JSONL tracer, not OpenTelemetry
Single-process local app; the debugging need is payload fidelity (audio, prompts, decision scores), which OTel attributes handle poorly, and OTel adds a collector/viewer dependency. A ~100-line `tracing.py` writing JSONL gives replayable ground truth. Event shape: `{"ts": <unix>, "t": <stream-elapsed>, "event": <type>, "trace_id": ..., **fields}`. `trace_id` is born when VAD opens a speech segment and carried through ASR → dedup → translate → broadcast.

### D2: Session directory, always-on events, opt-in audio
`~/.just-transcribe/sessions/<ISO-ts>/` created per recording start. `events.jsonl` always written — it is text-only and small, and the bug must be diagnosable without pre-enabling anything. Audio artifacts (`segments/*.wav` per ASR call, `stall_<ts>_<source>.wav` ring dumps) only when new config `debug_audio: true`. Sessions pruned at recording start: keep newest 20.

### D3: Heartbeat + watchdog inside orchestrator
One `asyncio` task emits a `heartbeat` event every 1s with per-stage counters (chunks per source since last beat, RMS, VAD in_speech, mic gated, local-ASR lock hold seconds, in-flight ASR/translate task counts, seconds since last interim/segment/broadcast, WS client count). Watchdog rule evaluated on each beat: chunks flowing AND speech seen AND no interim/segment for 10s → emit `stall` trace event + broadcast `{"type": "stall", ...}` + dump ring buffers (if `debug_audio`). Fires at most once per 30s.

### D4: Lock scoped to local provider; finals via per-source worker queues
- `asyncio.Lock` (exposed as `threading.Lock` used inside `run_in_executor` callable) moves into `ASREngine` (MLX cannot run concurrent GPU work). `RemoteASREngine` gets no lock — the HTTP server handles concurrency.
- `_vad_loop` pushes finalized `SpeechSegment`s onto per-source `asyncio.Queue`s; one worker task per source consumes them and runs ASR → dedup → emit → translate. Per-source ordering preserved (segments from one source can't reorder); VAD loop never blocks on ASR. Queue bounded (maxsize 8); on overflow the oldest segment is dropped with a `segment_dropped` trace event — better than unbounded memory during a long outage.
- `_interim_busy` becomes per-source dict.
- Alternative considered: single global worker (simpler, preserves cross-source order) — rejected because one source's slow ASR would still starve the other; UI already keys rows by id, and start-time ordering across sources was never guaranteed.

### D5: Bounded stop
`stop()` flushes VAD remainders into the worker queues, then waits for workers with `asyncio.wait_for(..., timeout=10s)`; on timeout, cancels workers and logs a `stop_timeout` trace event. Stop is never held hostage by a hung HTTP call.

### D6: ASR timeout configurable
`asr_timeout_s: float = 10.0` in `AppConfig` (TOML + `/api/config` round-trip), passed to `RemoteASREngine`. Retry policy unchanged (1 retry, backoff) → worst case ~23s instead of ~63s. Settings UI gets a numeric field in the remote-ASR section.

### D7: UI banner via existing WS channel
`useTranscript` gains `alert` state set on `error`/`stall` events (message + timestamp), cleared on next `segment`/`interim` or manual dismiss. `App.tsx` renders a dismissible banner. No new IPC.

### D8: Trace points (inventory)
| Event | Fields (beyond ts/t/trace_id) |
|---|---|
| `vad_speech_start` / `vad_speech_end` / `vad_force_emit` / `vad_flush` | source, duration_s |
| `vad_drop_short` | source, duration_s |
| `mic_gated` | reason (speaker_active/release_window), had_segment |
| `asr_call` / `asr_done` | source, kind (interim/final), audio_s, lock_wait_s, latency_s, provider, text, lang, wav (path or null), error |
| `dedup_drop` | similarity, other_source, text |
| `translate_call` / `translate_done` | segment_id, target_lang, latency_s, status, text/error |
| `broadcast` | type, ws_clients |
| `heartbeat` | see D3 |
| `stall` / `segment_dropped` / `stop_timeout` | context fields |

Full LLM prompt logged in `translate_call` only when `debug_audio` is on (prompts contain transcript content the user may not want persisted twice; events.jsonl already carries segment text, so default logs prompt length + context size only).

## Risks / Trade-offs

- [Removing global lock enables concurrent remote ASR calls] → per-source workers cap concurrency at 2 (one per source) + interim; remote servers handle this; local provider keeps its own lock so MLX is still serialized.
- [Fire-and-forget worker rework may change segment ordering across sources] → per-source queues keep intra-source order; cross-source interleaving already unordered today.
- [events.jsonl grows during long sessions] → line-oriented, ~200B/event, heartbeat dominates (~1/s ≈ 700KB/hour); session pruning caps disk. No rotation within a session.
- [Bounded final queue can drop speech during prolonged ASR outage] → explicit `segment_dropped` event + stall banner already showing; preferable to unbounded RAM.
- [Watchdog false positives (user genuinely silent)] → rule requires speech activity seen since last output, not just chunks flowing.
- [Tracer write blocking event loop] → writes are line appends to a buffered file handle, flushed on a timer; negligible vs existing sync VAD call.

## Migration Plan

Additive; no data migration. New config fields default safely (`asr_timeout_s=10`, `debug_audio=false`). Old config files load unchanged. Rollback = revert commit; session dirs are inert files.

## Open Questions

None blocking. Ring-buffer length fixed at 60s/source (~3.8MB RAM float32) — revisit only if memory-constrained.

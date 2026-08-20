# pipeline-tracing

## Purpose

Defines requirements for always-on structured tracing of the transcription pipeline, per-second heartbeats, stall detection, and opt-in audio debug recording, so pipeline stalls and drops can be diagnosed from session artifacts.

## Requirements

### Requirement: Structured session trace
The system SHALL write structured JSONL trace events to `~/.just-transcribe/sessions/<timestamp>/events.jsonl` for every recording session. Each event SHALL include a wall-clock timestamp, stream-elapsed time, event type, and (where applicable) a `trace_id` assigned when VAD opens a speech segment and propagated through ASR, dedup, translation, and broadcast. Trace events SHALL cover: VAD transitions (speech start/end, force-emit, flush, short-segment drop), mic gating decisions, ASR calls (source, kind interim/final, audio duration, lock wait, latency, provider, resulting text/language or error), dedup drops (with similarity score), translation calls (segment id, target language, latency, status), and WebSocket broadcasts. Event tracing SHALL be always on and SHALL NOT require any configuration.

#### Scenario: Final segment fully traced
- **WHEN** a spoken utterance is finalized by VAD, transcribed, and translated
- **THEN** `events.jsonl` contains vad_speech_start, vad_speech_end, asr_call, asr_done, translate_call, translate_done, and broadcast events sharing the same `trace_id`

#### Scenario: Suppression decisions recorded
- **WHEN** a mic segment is suppressed by half-duplex gating, or a segment is dropped as a cross-source duplicate
- **THEN** a `mic_gated` or `dedup_drop` event is written with the reason (and similarity score for dedup)

#### Scenario: Session pruning
- **WHEN** a recording session starts and more than 20 session directories exist
- **THEN** the oldest session directories SHALL be deleted so that at most 20 remain

### Requirement: Pipeline heartbeat
While recording, the system SHALL emit a `heartbeat` trace event every 1 second containing per-stage state: audio chunks received per source since the last beat, per-source RMS, VAD in-speech state per source, mic gating state, local ASR lock hold duration, in-flight ASR and translation task counts, seconds since last interim and last final segment, and connected WebSocket client count.

#### Scenario: Diagnosing a stall from heartbeats
- **WHEN** the pipeline produces no output for 10+ seconds while audio is flowing
- **THEN** the heartbeat events from that window identify the stuck stage (e.g., ASR lock held for N seconds, or zero chunks received)

### Requirement: Stall watchdog
The system SHALL detect a stalled pipeline: audio chunks flowing AND 10 seconds elapsed since speech first appeared without any interim or final output being produced for it. The stall clock SHALL start when unanswered speech begins (not at the last output), so resuming speech after a long silence SHALL NOT trigger a stall. On detection it SHALL write a `stall` trace event with a full stage snapshot and broadcast a `stall` WebSocket event. The watchdog SHALL fire at most once per 30 seconds.

#### Scenario: Stall detected during hung ASR call
- **WHEN** a remote ASR request hangs while the user is speaking
- **THEN** within ~10 seconds a `stall` event is written and broadcast to the UI

#### Scenario: Silence is not a stall
- **WHEN** audio chunks are flowing but no speech is detected (user silent)
- **THEN** no stall event is emitted

#### Scenario: Speech after long silence is not a stall
- **WHEN** the user is silent for 30 seconds and then speaks, with the pipeline healthy
- **THEN** no stall event is emitted at the moment speech resumes

### Requirement: Opt-in audio debug recording
When config `debug_audio` is true, the system SHALL save the exact audio sent to each final ASR call as WAV under the session directory (interim calls are not saved — they re-read the same accumulating audio every 0.5s and the final WAV contains the full utterance), SHALL maintain a rolling ring buffer of the last 60 seconds of raw audio per source, and SHALL dump the ring buffers to WAV when the stall watchdog fires. When `debug_audio` is false (default), no audio SHALL be written to disk and the full LLM prompt SHALL NOT be persisted (only prompt length and context size).

#### Scenario: Debug audio disabled by default
- **WHEN** `debug_audio` is absent from config.toml
- **THEN** the session directory contains only `events.jsonl`, no WAV files

#### Scenario: ASR input captured
- **WHEN** `debug_audio` is true and a segment is transcribed
- **THEN** the WAV sent to the ASR provider exists under the session directory and its path is recorded in the `asr_call` event

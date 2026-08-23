# kmp-pipeline-tracing

## ADDED Requirements

### Requirement: Structured session trace
The KMP Android app SHALL write structured JSONL trace events to app-internal storage at `filesDir/sessions/<timestamp>/events.jsonl` for every recording session. Tracing SHALL be always on and SHALL NOT require configuration. Each event SHALL include a wall-clock timestamp, monotonic session-elapsed time, and event type. Events SHALL cover: session start/end (with a config snapshot that SHALL NOT include API keys), capture errors, VAD speech start/end, finalized segments, ASR calls (kind interim/final, audio duration, latency, resulting text and language for finals, or error), and translation calls (segment id, latency, result count, or error). Trace emission SHALL NOT perform blocking I/O on the audio path; writes SHALL happen on a background dispatcher via a buffered writer.

#### Scenario: Final segment fully traced
- **WHEN** a spoken utterance is finalized by VAD, transcribed, and translated
- **THEN** `events.jsonl` contains `vad_speech_start`, `vad_speech_end`, `segment`, `asr_call`, `asr_done`, `translate_call`, and `translate_done` events for it in chronological order

#### Scenario: ASR failure traced
- **WHEN** a final ASR call fails (e.g. HTTP 500 after retry)
- **THEN** an `asr_error` event is written containing the error message

#### Scenario: No secrets in trace
- **WHEN** a session starts with ASR and LLM API keys configured
- **THEN** the `session_start` config snapshot contains model names and endpoint hosts but no API key values

### Requirement: Pipeline heartbeat
While recording, the system SHALL emit a `heartbeat` trace event every 1 second containing: audio chunks received since the last beat, most recent chunk RMS, VAD in-speech state, in-flight ASR and translation task counts, and seconds since the last interim and last final output.

#### Scenario: Diagnosing a stall from heartbeats
- **WHEN** the pipeline produces no output for 10+ seconds while audio is flowing
- **THEN** the heartbeat events from that window identify the stuck stage (e.g. in-flight ASR count ≥ 1 with growing seconds-since-last-final, or zero chunks received)

### Requirement: Stall watchdog
The system SHALL detect a stalled pipeline: audio chunks flowing AND 10 seconds elapsed since unanswered speech began without any interim or final output produced for it. The stall clock SHALL start when unanswered speech begins, so silence and resumed speech after silence SHALL NOT trigger a stall. On detection the system SHALL write a `stall` trace event containing a full stage snapshot. The watchdog SHALL fire at most once per 30 seconds.

#### Scenario: Stall detected during hung ASR call
- **WHEN** a remote ASR request hangs while the user is speaking
- **THEN** within ~10 seconds a `stall` event is written

#### Scenario: Silence is not a stall
- **WHEN** audio chunks are flowing but no speech is detected
- **THEN** no stall event is emitted

### Requirement: Opt-in audio debug recording
When the `debugAudio` setting is true, the system SHALL save the exact samples of each final ASR call as a WAV file in the session directory and record its filename in the corresponding trace event, and SHALL maintain a rolling ring buffer of the last 60 seconds of captured audio, dumped to WAV in the session directory when the stall watchdog fires. When `debugAudio` is false (default), no audio SHALL be written to disk.

#### Scenario: Debug audio disabled by default
- **WHEN** `debugAudio` has never been enabled and a session is recorded
- **THEN** the session directory contains only `events.jsonl`, no WAV files

#### Scenario: ASR input captured
- **WHEN** `debugAudio` is true and a segment is transcribed
- **THEN** the WAV sent to ASR exists in the session directory and its filename appears in the `segment` event

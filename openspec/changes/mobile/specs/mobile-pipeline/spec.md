## ADDED Requirements

### Requirement: Pipeline orchestrator with single unidirectional state
The system SHALL orchestrate capture → VAD → segmentation → remote ASR → remote translation in a coroutine-based `PipelineController`, exposing all UI-relevant output as a single immutable `StateFlow<UiState>` rather than multiple event streams.

#### Scenario: Reduce events into one state
- **WHEN** a finalized segment, interim update, translation result, or error is produced
- **THEN** the system SHALL reduce it into a new immutable `UiState` emitted on the single `StateFlow`, with no separate per-event stream controllers

#### Scenario: Final transcription path
- **WHEN** the `Segmenter` emits a `SpeechSegment`
- **THEN** the system SHALL transcribe it via the ASR client, reduce the resulting `TranscriptSegment` into state, and trigger asynchronous translation for applicable targets

#### Scenario: Interim transcription loop
- **WHEN** 0.5s elapses, pending VAD audio exists, and no interim request is in flight
- **THEN** the system SHALL transcribe the pending audio and reduce an interim update into state; if a previous interim request is still in flight it SHALL skip this tick

### Requirement: Structured-concurrency lifecycle
The system SHALL run the pipeline in a `CoroutineScope` owned by the foreground service, so that stopping cancels the scope and deterministically tears down capture, detector, and in-flight requests without start/stop races.

#### Scenario: Clean stop
- **WHEN** recording stops
- **THEN** the system SHALL cancel the pipeline scope, flush the `Segmenter` for a trailing segment, `close()` the detector in a `finally` block, and cancel in-flight ASR/translation requests

#### Scenario: Rapid stop then start
- **WHEN** the user stops and immediately restarts recording
- **THEN** the system SHALL not run two capture or detector instances concurrently; the previous scope's teardown SHALL complete its own cleanup without the caller nulling shared references

### Requirement: Remote ASR via OpenAI-compatible HTTP
The system SHALL transcribe segments by sending WAV audio as multipart `POST {base}/v1/audio/transcriptions` (with `model` and optional `language`) using a Ktor client, parsing `text` and `language` from the response.

#### Scenario: Transcribe a segment
- **WHEN** a finalized segment is sent to the ASR endpoint and a non-empty transcript is returned
- **THEN** the system SHALL produce a `TranscriptSegment` with an incrementing id, normalized language code, and the segment's start/end times

#### Scenario: Retry on transient failure
- **WHEN** the ASR endpoint returns HTTP 429, 500, 502, or 503
- **THEN** the system SHALL retry once after a 1s delay before failing

#### Scenario: Connection test
- **WHEN** the user tests the ASR server
- **THEN** the system SHALL `GET {base}/v1/models` and return success with the model list, or a typed error (connection refused / timeout / HTTP status)

### Requirement: Remote translation via OpenAI-compatible HTTP
The system SHALL translate segments via `POST {base}/v1/chat/completions` to up to two preferred target languages that differ from the segment language, including up to 3 preceding segments as context.

#### Scenario: Dual-target translation
- **WHEN** a segment's language differs from both configured preferred languages
- **THEN** the system SHALL request both translations in parallel and reduce each result into state as it arrives

#### Scenario: Skip matching target
- **WHEN** a preferred target language equals the segment's detected language
- **THEN** the system SHALL not request a translation for that target

#### Scenario: Non-blocking translation failure
- **WHEN** a translation request fails
- **THEN** the system SHALL reduce an error/skip without removing the already-displayed transcript segment and without tearing down the pipeline

### Requirement: Optional auto-gain
The system SHALL provide a configurable auto-gain stage (EMA toward a target peak with a maximum-gain clamp and soft clipping) applied before VAD/ASR, defaulting per the Tier-2 manual evaluation.

#### Scenario: Amplify low mic levels
- **WHEN** auto-gain is enabled and incoming audio peaks well below the target
- **THEN** the system SHALL smoothly raise the gain toward the target peak without exceeding the maximum gain, soft-clipping to avoid distortion

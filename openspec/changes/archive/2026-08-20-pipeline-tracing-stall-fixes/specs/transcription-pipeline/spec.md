# transcription-pipeline (delta)

## MODIFIED Requirements

### Requirement: Single-model ASR with streaming
The system SHALL use a pluggable ASR provider to transcribe all audio. The provider SHALL implement the ASRProvider protocol (transcribe_segment, set_language, is_loaded). The system SHALL NOT instantiate multiple ASR providers simultaneously. The local ASR provider SHALL use the `mlx-audio` library (`mlx_audio.stt.load`) to load models optimized for Apple Silicon, supporting both full-precision and quantized model variants. The configured `asr_model` value SHALL be used verbatim — the system SHALL NOT rewrite or migrate model names on config load.

Finalized speech segments SHALL be dispatched to a per-source worker queue (one worker per source) so the VAD loop never blocks on ASR. Segments from the same source SHALL be transcribed in FIFO order. Serialization of concurrent transcription SHALL be the local provider's responsibility (the local MLX engine SHALL hold an internal lock because Metal does not support concurrent GPU access); the remote provider SHALL NOT be serialized by any global lock. Each per-source queue SHALL be bounded (8 segments); on overflow the oldest segment SHALL be dropped and a `segment_dropped` trace event written.

#### Scenario: Transcribe mic speech segment
- **WHEN** a finalized speech segment from the mic stream enters the ASR queue
- **THEN** the system feeds it to the active ASR provider and produces a transcription result tagged with source "mic" and label "You"

#### Scenario: Transcribe speaker speech segment
- **WHEN** a finalized speech segment from the speaker stream enters the ASR queue
- **THEN** the system feeds it to the active ASR provider and produces a transcription result tagged with source "speaker" and label "Others"

#### Scenario: Concurrent speech from both streams
- **WHEN** speech segments from both streams are queued simultaneously
- **THEN** each source's worker processes its own queue in FIFO order; with the local provider the engine's internal lock serializes GPU access, with the remote provider the requests MAY run concurrently

#### Scenario: VAD loop not blocked by slow ASR
- **WHEN** an ASR call takes 10+ seconds (e.g., hung remote server)
- **THEN** the VAD loop SHALL continue consuming audio chunks and detecting segments during that call

#### Scenario: Load quantized model
- **WHEN** the configured `asr_model` is a quantized variant (e.g., `mlx-community/Qwen3-ASR-1.7B-8bit`)
- **THEN** the local ASR engine SHALL load the model successfully via `mlx-audio` and transcribe audio with the same `ASRProvider` interface

#### Scenario: Model name preserved verbatim
- **WHEN** the configured `asr_model` is `Qwen/Qwen3-ASR-1.7B` (or any other value)
- **THEN** the system SHALL pass that exact model name to the active ASR provider without rewriting it

## ADDED Requirements

### Requirement: Per-source interim state
Interim transcription busy-state SHALL be tracked per source, so a slow interim transcription for one source SHALL NOT prevent interim transcription of the other source.

#### Scenario: Speaker interim not starved by mic
- **WHEN** a mic interim transcription is in flight and speaker audio has pending speech
- **THEN** the speaker interim transcription MAY still be attempted on the next interim tick

### Requirement: Bounded stop
`stop()` SHALL flush remaining VAD buffers into the ASR worker queues and wait for in-flight work for at most 10 seconds. On timeout, workers SHALL be cancelled, a `stop_timeout` trace event written, and stop SHALL complete.

#### Scenario: Stop during hung ASR call
- **WHEN** the user stops recording while a remote ASR request is hung
- **THEN** the stop request completes within ~10 seconds instead of waiting for the full ASR timeout/retry cycle

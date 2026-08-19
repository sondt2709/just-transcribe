## MODIFIED Requirements

### Requirement: Single-model ASR with streaming
The system SHALL use a pluggable ASR provider to transcribe all audio. The provider SHALL implement the ASRProvider protocol (transcribe_segment, set_language, is_loaded). Speech segments from both mic and speaker streams SHALL be fed sequentially through the active provider. The system SHALL NOT instantiate multiple ASR providers simultaneously. The local ASR provider SHALL use the `mlx-audio` library (`mlx_audio.stt.load`) to load models optimized for Apple Silicon, supporting both full-precision and quantized model variants. The configured `asr_model` value SHALL be used verbatim — the system SHALL NOT rewrite or migrate model names on config load.

#### Scenario: Transcribe mic speech segment
- **WHEN** a finalized speech segment from the mic stream enters the ASR queue
- **THEN** the system feeds it to the active ASR provider and produces a transcription result tagged with source "mic" and label "You"

#### Scenario: Transcribe speaker speech segment
- **WHEN** a finalized speech segment from the speaker stream enters the ASR queue
- **THEN** the system feeds it to the active ASR provider and produces a transcription result tagged with source "speaker" and label "Others"

#### Scenario: Concurrent speech from both streams
- **WHEN** speech segments from both streams are queued simultaneously
- **THEN** the system SHALL process them sequentially (FIFO) through the ASR provider, serialized by the orchestrator's lock

#### Scenario: Load quantized model
- **WHEN** the configured `asr_model` is a quantized variant (e.g., `mlx-community/Qwen3-ASR-1.7B-8bit`)
- **THEN** the local ASR engine SHALL load the model successfully via `mlx-audio` and transcribe audio with the same `ASRProvider` interface

#### Scenario: Model name preserved verbatim
- **WHEN** the configured `asr_model` is `Qwen/Qwen3-ASR-1.7B` (or any other value)
- **THEN** the system SHALL pass that exact model name to the active ASR provider without rewriting it

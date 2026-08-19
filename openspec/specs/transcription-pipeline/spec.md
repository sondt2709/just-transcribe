## ADDED Requirements

### Requirement: VAD filtering
The system SHALL apply Silero VAD to each audio stream independently to detect speech segments. Only audio segments containing speech SHALL be forwarded to the ASR engine. The VAD SHALL use a speech threshold of 0.5 and minimum speech duration of 250ms.

#### Scenario: Speech detected in audio chunk
- **WHEN** VAD detects speech probability above threshold in an audio chunk
- **THEN** the chunk SHALL be buffered and included in the current speech segment

#### Scenario: Silence detected after speech
- **WHEN** VAD detects silence lasting longer than the configured minimum silence duration (2.0s) after a speech segment
- **THEN** the buffered speech segment SHALL be finalized and submitted to the ASR queue

#### Scenario: No speech in audio
- **WHEN** an audio chunk contains no speech above threshold
- **THEN** the chunk SHALL be discarded without forwarding to ASR

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

### Requirement: Automatic language detection
The system SHALL use the ASR model's built-in language detection to automatically identify the language of each transcribed segment. The detected language SHALL be included in the segment output. The system SHALL normalize the language output from `mlx-audio` (which returns a list) into a single language code string.

#### Scenario: Vietnamese speech detected
- **WHEN** the ASR model processes a speech segment containing Vietnamese
- **THEN** the output segment SHALL include `lang: "vi"` in its metadata

#### Scenario: Mixed language in conversation
- **WHEN** different segments contain different languages (e.g., English then Cantonese)
- **THEN** each segment SHALL independently report its detected language

#### Scenario: Language returned as list
- **WHEN** `mlx-audio` returns language detection as a list (e.g., `['en']`)
- **THEN** the system SHALL extract the first element and return it as a string

### Requirement: Segment output format
Each transcription segment SHALL include: unique ID, text content, source ("mic" or "speaker"), speaker label ("You" or "Others"), detected language code, start timestamp, and end timestamp.

#### Scenario: Complete segment emitted
- **WHEN** ASR produces a transcription result
- **THEN** the system emits a segment with all required fields: `id`, `text`, `source`, `speaker`, `lang`, `start`, `end`

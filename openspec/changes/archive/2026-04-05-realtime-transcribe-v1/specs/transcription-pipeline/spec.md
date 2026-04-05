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
The system SHALL use a single mlx-qwen3-asr Session instance (Qwen3-ASR 1.7B) to transcribe all audio. Speech segments from both mic and speaker streams SHALL be fed sequentially via `feed_audio()`. The system SHALL NOT instantiate multiple ASR model instances.

#### Scenario: Transcribe mic speech segment
- **WHEN** a finalized speech segment from the mic stream enters the ASR queue
- **THEN** the system feeds it to the Session and produces a transcription result tagged with source "mic" and label "You"

#### Scenario: Transcribe speaker speech segment
- **WHEN** a finalized speech segment from the speaker stream enters the ASR queue
- **THEN** the system feeds it to the Session and produces a transcription result tagged with source "speaker" and label "Others"

#### Scenario: Concurrent speech from both streams
- **WHEN** speech segments from both streams are queued simultaneously
- **THEN** the system SHALL process them sequentially (FIFO) through the single ASR Session

### Requirement: Automatic language detection
The system SHALL use Qwen3-ASR's built-in language detection (no explicit language parameter) to automatically identify the language of each transcribed segment. The detected language SHALL be included in the segment output.

#### Scenario: Vietnamese speech detected
- **WHEN** the ASR model processes a speech segment containing Vietnamese
- **THEN** the output segment SHALL include `lang: "vi"` in its metadata

#### Scenario: Mixed language in conversation
- **WHEN** different segments contain different languages (e.g., English then Cantonese)
- **THEN** each segment SHALL independently report its detected language

### Requirement: Segment output format
Each transcription segment SHALL include: unique ID, text content, source ("mic" or "speaker"), speaker label ("You" or "Others"), detected language code, start timestamp, and end timestamp.

#### Scenario: Complete segment emitted
- **WHEN** ASR produces a transcription result
- **THEN** the system emits a segment with all required fields: `id`, `text`, `source`, `speaker`, `lang`, `start`, `end`

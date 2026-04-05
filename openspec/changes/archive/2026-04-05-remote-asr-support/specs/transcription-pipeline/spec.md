## MODIFIED Requirements

### Requirement: Single-model ASR with streaming
The system SHALL use a pluggable ASR provider to transcribe all audio. The provider SHALL implement the ASRProvider protocol (transcribe_segment, set_language, is_loaded). Speech segments from both mic and speaker streams SHALL be fed sequentially through the active provider. The system SHALL NOT instantiate multiple ASR providers simultaneously.

#### Scenario: Transcribe mic speech segment
- **WHEN** a finalized speech segment from the mic stream enters the ASR queue
- **THEN** the system feeds it to the active ASR provider and produces a transcription result tagged with source "mic" and label "You"

#### Scenario: Transcribe speaker speech segment
- **WHEN** a finalized speech segment from the speaker stream enters the ASR queue
- **THEN** the system feeds it to the active ASR provider and produces a transcription result tagged with source "speaker" and label "Others"

#### Scenario: Concurrent speech from both streams
- **WHEN** speech segments from both streams are queued simultaneously
- **THEN** the system SHALL process them sequentially (FIFO) through the ASR provider, serialized by the orchestrator's lock

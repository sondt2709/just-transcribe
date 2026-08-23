## ADDED Requirements

### Requirement: Pipeline orchestrator
The system SHALL implement a pipeline orchestrator that wires audio capture -> VAD -> ASR -> translation as an async pipeline with two transcription modes: interim (every 0.5s) and final (on VAD silence detection).

#### Scenario: Start pipeline
- **WHEN** the user starts recording
- **THEN** the system SHALL start audio capture, initialize VAD, and launch the VAD processing loop and interim transcription loop concurrently

#### Scenario: Stop pipeline
- **WHEN** the user stops recording
- **THEN** the system SHALL flush remaining VAD buffers as final segments, stop audio capture, cancel all processing loops, and reset VAD state

### Requirement: Interim transcription loop
The system SHALL run an interim transcription loop that fires every 0.5 seconds. When the VAD has accumulated speech audio longer than the minimum speech duration, the system SHALL send it to the remote ASR service and emit an interim transcript event.

#### Scenario: Interim transcription during active speech
- **WHEN** the 0.5s timer fires and the VAD has pending audio for the mic source
- **THEN** the system SHALL encode the pending audio as WAV, POST it to the remote ASR endpoint, and emit an interim event with the partial text

#### Scenario: No interim when silent
- **WHEN** the 0.5s timer fires and no speech is active
- **THEN** the system SHALL skip the interim cycle without making any HTTP request

#### Scenario: Interim skipped while previous is in-flight
- **WHEN** the 0.5s timer fires but a previous interim transcription HTTP request is still pending
- **THEN** the system SHALL skip this cycle to avoid request pileup

### Requirement: Final transcription on VAD silence
The system SHALL transcribe finalized speech segments (emitted by VAD on silence detection) by sending them to the remote ASR service and emitting a final segment event.

#### Scenario: Final segment transcribed
- **WHEN** the VAD emits a finalized speech segment
- **THEN** the system SHALL encode the audio as WAV, POST it to the remote ASR endpoint, and emit a segment event with id, text, speaker ("You"), detected language, and timing

#### Scenario: ASR returns empty text
- **WHEN** the remote ASR returns an empty text response for a segment
- **THEN** the system SHALL discard the segment without emitting an event

### Requirement: Remote ASR via HTTP
The system SHALL transcribe audio by POSTing WAV-encoded audio to an OpenAI-compatible endpoint at `{asr_base_url}/v1/audio/transcriptions` as multipart form data with fields: `file` (WAV, PCM16, 16kHz, mono), `model` (configured model ID), and optionally `language` (if not auto-detect).

#### Scenario: Successful remote transcription
- **WHEN** a speech segment is sent to the remote ASR server
- **THEN** the system SHALL encode float32 PCM to WAV (44-byte header + PCM16 data), POST as multipart, and parse the JSON response for `text` and `language` fields

#### Scenario: Remote ASR server unreachable
- **WHEN** the HTTP request to the ASR server fails (connection refused, timeout, DNS failure)
- **THEN** the system SHALL emit an error event and continue the pipeline — ASR failure SHALL NOT crash the recording session

#### Scenario: Retry on transient failure
- **WHEN** the ASR server returns HTTP 429, 500, 502, or 503
- **THEN** the system SHALL retry once after a 1-second delay before reporting failure

### Requirement: Automatic translation
The system SHALL automatically translate finalized transcript segments when the detected language differs from any configured target language. Translation SHALL be asynchronous and non-blocking.

#### Scenario: Segment language differs from target
- **WHEN** a finalized segment has `lang: "en"` and `preferred_language` is "vi"
- **THEN** the system SHALL asynchronously POST to `{llm_api_base}/v1/chat/completions` with a translation prompt and emit a translation event when the response arrives

#### Scenario: Segment language matches target
- **WHEN** a finalized segment has `lang: "vi"` and `preferred_language` is "vi"
- **THEN** no translation request SHALL be made

#### Scenario: Dual translation targets
- **WHEN** a segment language differs from both `preferred_language` and `preferred_language_2`
- **THEN** the system SHALL send two parallel translation requests and emit separate translation events for each

#### Scenario: Translation failure
- **WHEN** the LLM API request fails or times out
- **THEN** the system SHALL log the error and continue — translation failure SHALL NOT block transcription

### Requirement: Translation context window
The system SHALL include up to 3 preceding finalized segments as context in the translation prompt to improve coherence.

#### Scenario: Translation with prior context
- **WHEN** translating segment N and segments N-1 through N-3 exist
- **THEN** the translation prompt SHALL include those prior segments as conversation context for the LLM

### Requirement: WAV encoding
The system SHALL encode PCM float32 audio samples to WAV format (PCM16, 16kHz, mono) in-memory for HTTP upload. The encoding SHALL produce a valid WAV file with a 44-byte RIFF header.

#### Scenario: Encode audio for upload
- **WHEN** a speech segment needs to be sent to the remote ASR
- **THEN** the system SHALL convert float32 samples to int16, prepend a 44-byte WAV header (RIFF, fmt, data chunks), and produce a byte buffer ready for multipart upload

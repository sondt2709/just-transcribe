## ADDED Requirements

### Requirement: Microphone audio capture
The system SHALL capture audio from the default microphone using sounddevice at 16kHz sample rate, mono channel, float32 PCM format. The capture SHALL run in a callback-based stream that pushes audio chunks to an internal queue.

#### Scenario: Start microphone capture
- **WHEN** the backend receives a start command with mic enabled
- **THEN** the system opens a sounddevice InputStream at 16kHz mono and begins pushing audio chunks to the processing queue tagged with source "mic"

#### Scenario: Stop microphone capture
- **WHEN** the backend receives a stop command
- **THEN** the system closes the sounddevice InputStream and flushes any remaining buffered audio

### Requirement: System audio capture via audiotee
The system SHALL capture system audio by spawning the audiotee binary as a subprocess with `--sample-rate 16000` flag. The system SHALL read raw PCM float32 mono audio from audiotee's stdout in a dedicated thread.

#### Scenario: Start system audio capture
- **WHEN** the backend receives a start command with speaker enabled
- **THEN** the system spawns `audiotee --sample-rate 16000` as a subprocess and begins reading stdout PCM data, pushing chunks to the processing queue tagged with source "speaker"

#### Scenario: audiotee binary not found
- **WHEN** the audiotee binary does not exist at the expected path (`~/.just-transcribe/bin/audiotee`)
- **THEN** the system SHALL report an error via the status API indicating audiotee is missing

#### Scenario: audiotee process exits unexpectedly
- **WHEN** the audiotee subprocess terminates during capture
- **THEN** the system SHALL emit an error event via WebSocket and stop the speaker capture stream

### Requirement: Dual-stream source tagging
The system SHALL tag every audio chunk with its source ("mic" or "speaker") so downstream pipeline components can attribute transcription segments to the correct source.

#### Scenario: Concurrent mic and speaker capture
- **WHEN** both mic and speaker capture are active
- **THEN** audio chunks from both streams SHALL be independently queued with their respective source tags and processed without mixing

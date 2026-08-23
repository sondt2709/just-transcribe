# mobile-audio-capture

## Purpose

Microphone PCM capture for the KMP Android app: AudioRecord-based capture exposed as a Flow of PCM chunks, with a foreground service for screen-off recording.

## Requirements

### Requirement: Microphone PCM capture in KMP
The system SHALL capture microphone audio as raw little-endian PCM 16-bit mono via a Kotlin Multiplatform `AudioCapture` (Android `AudioRecord`), exposing it as a cold `Flow<ByteArray>` of ~100 ms chunks, reusing the verified `audio-stream-poc` implementation.

#### Scenario: Resolve a supported sample rate
- **WHEN** `AudioCapture` is constructed
- **THEN** the system SHALL select 16000 Hz if supported, otherwise fall back to 44100 Hz, and expose the rate actually in use

#### Scenario: Stream PCM chunks while collected
- **WHEN** the `pcmFrames()` flow is collected
- **THEN** the system SHALL start the microphone and emit raw PCM16 mono byte chunks until the collector is cancelled, after which it SHALL stop and release the recorder

#### Scenario: Single collection only
- **WHEN** the cold mic flow would be collected a second time
- **THEN** the system SHALL avoid starting a second `AudioRecord`; the VAD stage decorates the single collected flow and re-emits

### Requirement: VAD requires 16 kHz capture
The system SHALL enable on-device VAD only when capture is running at 16000 Hz; when capture falls back to 44100 Hz the system SHALL disable VAD gating and stream raw audio.

#### Scenario: Disable VAD on sample-rate fallback
- **WHEN** `AudioCapture.sampleRate` is not 16000
- **THEN** the system SHALL not construct the Silero detector and SHALL process audio without VAD gating

### Requirement: Microphone permission
The system SHALL request `RECORD_AUDIO` before capture and handle denied and permanently-denied outcomes.

#### Scenario: Permission denied
- **WHEN** the user denies the microphone permission
- **THEN** the system SHALL not start capture and SHALL surface a clear "microphone permission required" state

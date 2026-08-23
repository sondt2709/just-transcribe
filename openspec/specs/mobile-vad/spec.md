# mobile-vad

## Purpose

On-device voice activity detection for the KMP Android app: Silero detector plus pure-Kotlin PcmFramer and Segmenter producing timed speech segments and interim audio.

## Requirements

### Requirement: On-device VAD via verified Silero detector
The system SHALL perform voice activity detection on-device using the `audio-stream-poc` `VoiceActivityDetector` seam, implemented on Android by `AndroidVoiceActivityDetector` (gkonovalov/android-vad Silero, CPU). The detector SHALL return a per-frame boolean decision for a 1024-byte (512-sample, 16-bit mono, 16 kHz) frame, with onset/hangover hysteresis owned by pure-Kotlin code rather than the library.

#### Scenario: Per-frame speech decision
- **WHEN** a 1024-byte Silero frame is submitted to the detector
- **THEN** the system SHALL return a boolean indicating whether the frame contains speech

#### Scenario: Fresh detector per session
- **WHEN** a recording session starts and later stops
- **THEN** the system SHALL construct a fresh detector at start (clean Silero state) and `close()` it at stop in a `finally` block

#### Scenario: Reframe arbitrary chunks
- **WHEN** ~100 ms capture chunks of arbitrary size arrive
- **THEN** `PcmFramer` SHALL reassemble them into fixed 1024-byte frames, carrying any remainder across chunk boundaries without losing bytes

### Requirement: Utterance segmentation
The system SHALL turn the detector's per-frame booleans into discrete speech segments using the same timing as the desktop pipeline: minimum speech 0.25s, minimum silence 1.0s to end a segment, and maximum speech 15s with force-emit.

#### Scenario: Speech onset
- **WHEN** the detector reports speech and no segment is currently accumulating
- **THEN** the system SHALL begin accumulating audio (including a short pre-roll so the word onset is not clipped) and record the start time

#### Scenario: Segment finalized on silence
- **WHEN** 1.0s of continuous silence elapses while a segment is accumulating
- **THEN** the system SHALL emit the accumulated audio as a `SpeechSegment` with start time, end time, and concatenated PCM samples, provided it is at least 0.25s long

#### Scenario: Segment too short discarded
- **WHEN** a segment ended by silence is shorter than 0.25s
- **THEN** the system SHALL discard it without emitting

#### Scenario: Force-emit on maximum duration
- **WHEN** an accumulating segment reaches 15s without a silence break
- **THEN** the system SHALL force-emit the accumulated audio as a segment and begin a new accumulation

### Requirement: Pending audio for interim transcription
The system SHALL expose the currently accumulating (not yet finalized) speech audio without clearing it, for interim transcription.

#### Scenario: Pending audio during active speech
- **WHEN** interim transcription requests pending audio while a segment is accumulating with at least the minimum speech duration
- **THEN** the system SHALL return a copy of the accumulated samples without modifying the segment buffer

#### Scenario: No pending audio when idle
- **WHEN** interim transcription requests pending audio and no segment is accumulating
- **THEN** the system SHALL return null

### Requirement: Segmenter reset and flush
The system SHALL flush trailing speech and reset all segmentation state when recording stops.

#### Scenario: Flush on stop
- **WHEN** recording stops while a segment is accumulating
- **THEN** the system SHALL emit the trailing audio as a final segment if it is at least the minimum speech duration, then clear all buffers and segmentation state

### Requirement: Speech-state indicator
The system SHALL expose a boolean speech-state signal (derived from the gate hysteresis) for the UI, independent of whether stream gating is applied.

#### Scenario: Indicator reflects speech
- **WHEN** speech begins and later stops
- **THEN** the speech-state signal SHALL become true on onset (within ~100 ms) and return to false after the hangover window

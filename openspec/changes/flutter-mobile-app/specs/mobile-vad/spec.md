## ADDED Requirements

### Requirement: On-device VAD using Silero ONNX
The system SHALL perform voice activity detection on-device using the Silero VAD ONNX model (`silero_vad.onnx`, ~1.5MB) via `onnxruntime_flutter`. The model SHALL be bundled as a Flutter asset.

#### Scenario: Load VAD model on app start
- **WHEN** the app launches
- **THEN** the system SHALL load `silero_vad.onnx` from assets into an ONNX Runtime inference session, ready for processing

#### Scenario: Process audio chunk through VAD
- **WHEN** a 512-sample audio chunk (32ms at 16kHz) is received from the audio capture service
- **THEN** the system SHALL run ONNX inference on the chunk and produce a speech probability value between 0.0 and 1.0

### Requirement: Speech segment detection
The system SHALL detect speech segments by tracking transitions between speech and silence states using configurable thresholds: speech threshold (0.5), negative threshold (0.35), minimum speech duration (0.25s), minimum silence duration (2.0s), and maximum speech duration (30s).

#### Scenario: Speech onset detected
- **WHEN** the VAD probability exceeds the speech threshold (0.5) and no speech is currently active
- **THEN** the system SHALL begin buffering audio chunks as a new speech segment and record the start time

#### Scenario: Speech segment finalized on silence
- **WHEN** the VAD probability drops below the negative threshold (0.35) for longer than the minimum silence duration (2.0s) while speech is active
- **THEN** the system SHALL emit the buffered audio as a finalized `SpeechSegment` with start time, end time, and concatenated PCM samples

#### Scenario: Speech too short to emit
- **WHEN** a silence period ends a speech segment that is shorter than the minimum speech duration (0.25s)
- **THEN** the system SHALL discard the segment without emitting it

#### Scenario: Force-emit on maximum duration
- **WHEN** a speech segment exceeds the maximum speech duration (30s) without a silence break
- **THEN** the system SHALL force-emit the accumulated audio as a finalized segment and start a new accumulation

### Requirement: Pending audio for interim transcription
The system SHALL expose the currently accumulated (not yet finalized) speech audio for interim transcription without clearing the buffer.

#### Scenario: Get pending audio during active speech
- **WHEN** the interim loop requests pending audio and speech is currently active with accumulated audio longer than the minimum speech duration
- **THEN** the system SHALL return a copy of the accumulated PCM samples without modifying the speech buffer

#### Scenario: No pending audio when silent
- **WHEN** the interim loop requests pending audio and no speech is currently active
- **THEN** the system SHALL return null

### Requirement: VAD state reset
The system SHALL reset all VAD internal state (buffers, speech tracking, ONNX hidden states) when recording stops, ensuring a clean state for the next recording session.

#### Scenario: Reset on stop
- **WHEN** recording stops
- **THEN** the system SHALL flush any remaining speech as a final segment (if long enough), clear all buffers, and reset the ONNX model's hidden state tensors

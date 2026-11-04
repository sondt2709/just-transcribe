## MODIFIED Requirements

### Requirement: Microphone audio capture
The system SHALL capture audio from the default microphone using sounddevice at 16kHz sample rate, mono channel, float32 PCM format. The capture SHALL run in a callback-based stream that pushes audio chunks to an internal queue. Before the system opens the microphone stream, it SHALL reload the PortAudio device list, so that the stream uses the current default input device.

#### Scenario: Start microphone capture
- **WHEN** the backend receives a start command with mic enabled
- **THEN** the system opens a sounddevice InputStream at 16kHz mono and begins pushing audio chunks to the processing queue tagged with source "mic"

#### Scenario: Start after the audio devices change
- **WHEN** an audio input device is removed or added while the backend runs, and the backend then receives a start command with mic enabled
- **THEN** the system reloads the PortAudio device list, opens the InputStream on the current default input device, and returns status "recording"

#### Scenario: Stop microphone capture
- **WHEN** the backend receives a stop command
- **THEN** the system closes the sounddevice InputStream and flushes any remaining buffered audio

## ADDED Requirements

### Requirement: FastAPI HTTP control API
The system SHALL expose a FastAPI HTTP server on a dynamically assigned port (passed via `--port` CLI argument). The server SHALL provide REST endpoints for controlling the transcription pipeline.

#### Scenario: Start transcription
- **WHEN** a POST request is made to `/api/start` with body `{ "mic": true, "speaker": true }`
- **THEN** the server starts audio capture for the specified streams and begins the transcription pipeline, returning `{ "status": "recording" }`

#### Scenario: Stop transcription
- **WHEN** a POST request is made to `/api/stop`
- **THEN** the server stops all audio capture and pipeline processing, returning `{ "status": "stopped" }`

#### Scenario: Query status
- **WHEN** a GET request is made to `/api/status`
- **THEN** the server returns current state including: recording status, model loaded state, active streams, and segment count

#### Scenario: List audio devices
- **WHEN** a GET request is made to `/api/devices`
- **THEN** the server returns available microphone devices from sounddevice

### Requirement: WebSocket transcript streaming
The system SHALL expose a WebSocket endpoint at `/ws/transcript` that streams transcription events to connected clients in real-time.

#### Scenario: Segment event
- **WHEN** the ASR pipeline produces a finalized segment
- **THEN** the server broadcasts `{ "type": "segment", "id": N, "text": "...", "speaker": "You", "lang": "en", "start": 1.2, "end": 2.5 }` to all connected WebSocket clients

#### Scenario: Interim event
- **WHEN** the ASR pipeline produces a partial/interim transcription
- **THEN** the server broadcasts `{ "type": "interim", "text": "...", "source": "mic" }` to all connected clients

#### Scenario: Translation event
- **WHEN** a translation completes for a segment
- **THEN** the server broadcasts `{ "type": "translate", "id": N, "text": "...", "target_lang": "en" }` to all connected clients

#### Scenario: Error event
- **WHEN** an error occurs in the pipeline (audiotee crash, model failure)
- **THEN** the server broadcasts `{ "type": "error", "message": "..." }` to all connected clients

### Requirement: Graceful shutdown on parent death
The system SHALL monitor stdin for EOF. When stdin closes (indicating the parent Electron process has exited), the system SHALL terminate audiotee, close audio streams, and exit cleanly.

#### Scenario: Electron process exits
- **WHEN** the Python backend detects stdin EOF
- **THEN** it SHALL terminate the audiotee subprocess, stop all audio capture, and exit with code 0

#### Scenario: SIGTERM received
- **WHEN** the Python backend receives SIGTERM
- **THEN** it SHALL perform the same graceful shutdown as stdin EOF

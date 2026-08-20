# backend-server (delta)

## MODIFIED Requirements

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

#### Scenario: Stall event
- **WHEN** the stall watchdog detects a stalled pipeline
- **THEN** the server broadcasts `{ "type": "stall", "message": "...", "stage": "..." }` to all connected clients

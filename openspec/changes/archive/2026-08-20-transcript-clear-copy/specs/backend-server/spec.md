## MODIFIED Requirements

### Requirement: WebSocket transcript streaming
The system SHALL expose a WebSocket endpoint at `/ws/transcript` that streams transcription events to connected clients in real-time.

#### Scenario: Segment event
- **WHEN** the ASR pipeline produces a finalized segment
- **THEN** the server broadcasts `{ "type": "segment", "id": N, "text": "...", "speaker": "You", "lang": "en", "start": 1.2, "end": 2.5, "wall_start": 1755671525.3 }` to all connected WebSocket clients, where `wall_start` is the segment's wall-clock start time as unix epoch seconds

#### Scenario: Interim event
- **WHEN** the ASR pipeline produces a partial/interim transcription
- **THEN** the server broadcasts `{ "type": "interim", "text": "...", "source": "mic" }` to all connected clients

#### Scenario: Translation event
- **WHEN** a translation completes for a segment
- **THEN** the server broadcasts `{ "type": "translate", "id": N, "text": "...", "target_lang": "en" }` to all connected clients

#### Scenario: Error event
- **WHEN** an error occurs in the pipeline (audiotee crash, model failure)
- **THEN** the server broadcasts `{ "type": "error", "message": "..." }` to all connected clients

#### Scenario: Clear event
- **WHEN** the transcript is cleared via `POST /api/transcript/clear`
- **THEN** the server broadcasts `{ "type": "clear" }` to all connected clients

## ADDED Requirements

### Requirement: Transcript history
The server SHALL keep an in-memory history of all finalized segments since backend start or the last clear, including translations merged in as they arrive. The history SHALL be exposed via `GET /api/transcript` returning segments with `id`, `text`, `source`, `speaker`, `lang`, `start`, `end`, `wall_start`, and `translations` (map of target language to translated text). `POST /api/transcript/clear` SHALL empty the history and broadcast a `clear` event. History SHALL NOT persist across backend restarts.

#### Scenario: History accumulates segments and translations
- **WHEN** segments are finalized and translations complete
- **THEN** `GET /api/transcript` returns every segment with its merged `translations` map

#### Scenario: Clear empties history
- **WHEN** `POST /api/transcript/clear` is called
- **THEN** subsequent `GET /api/transcript` returns an empty list and a `clear` event is broadcast to all WebSocket clients

#### Scenario: Late translation after clear
- **WHEN** a translation completes for a segment that was removed by a clear
- **THEN** the server ignores the merge (no error, no new history entry)

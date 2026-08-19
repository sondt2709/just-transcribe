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

### Requirement: Graceful shutdown on parent death
The system SHALL monitor stdin for EOF. When stdin closes (indicating the parent Electron process has exited), the system SHALL terminate audiotee, close audio streams, and exit cleanly.

#### Scenario: Electron process exits
- **WHEN** the Python backend detects stdin EOF
- **THEN** it SHALL terminate the audiotee subprocess, stop all audio capture, and exit with code 0

#### Scenario: SIGTERM received
- **WHEN** the Python backend receives SIGTERM
- **THEN** it SHALL perform the same graceful shutdown as stdin EOF

### Requirement: Remote ASR connection test endpoint
The server SHALL expose `POST /api/asr/test` that accepts `{url: string, api_key?: string}`, tests connectivity to the remote ASR server by calling `GET {url}/v1/models`, and returns `{ok: boolean, models?: string[], error?: string}`.

#### Scenario: Successful connection test
- **WHEN** a POST to `/api/asr/test` is made with a valid URL and the remote server responds with a model list
- **THEN** the server returns `{ok: true, models: ["Qwen/Qwen3-ASR-1.7B", ...]}` with HTTP 200

#### Scenario: Failed connection test
- **WHEN** a POST to `/api/asr/test` is made and the remote server is unreachable or returns an error
- **THEN** the server returns `{ok: false, error: "Connection refused"}` with HTTP 200 (the outer request succeeds; the error describes the remote failure)

### Requirement: Remote ASR model list endpoint
The server SHALL expose `GET /api/asr/models` that queries the currently configured remote ASR server's `GET /v1/models` endpoint and returns the list of available model IDs.

#### Scenario: Models fetched from configured server
- **WHEN** a GET to `/api/asr/models` is made and `asr_base_url` is configured
- **THEN** the server queries the remote server and returns `{models: ["Qwen/Qwen3-ASR-1.7B", ...]}` with HTTP 200

#### Scenario: No remote server configured
- **WHEN** a GET to `/api/asr/models` is made and `asr_base_url` is empty
- **THEN** the server returns `{models: [], error: "No remote ASR server configured"}` with HTTP 200

### Requirement: Provider switch validation
The server SHALL validate provider readiness when `asr_provider` is changed via `PUT /api/config`. For remote: verify the configured URL is reachable and the selected model is available. For local: verify the model exists in HuggingFace cache. The config update SHALL be rejected if validation fails.

#### Scenario: Switch to remote — valid configuration
- **WHEN** PUT `/api/config` changes `asr_provider` to "remote" with a valid `asr_base_url` and `asr_model`
- **THEN** the server tests the connection, confirms the model exists on the remote server, re-initializes the ASR provider, and returns success

#### Scenario: Switch to remote — invalid configuration
- **WHEN** PUT `/api/config` changes `asr_provider` to "remote" but the remote server is unreachable
- **THEN** the server returns an error response and does NOT change the active provider

#### Scenario: Switch to local — model available
- **WHEN** PUT `/api/config` changes `asr_provider` to "local" and the model exists in HuggingFace cache
- **THEN** the server loads the local MLX model and returns success

#### Scenario: Switch to local — model missing
- **WHEN** PUT `/api/config` changes `asr_provider` to "local" but the model is not cached
- **THEN** the server returns an error response and does NOT change the active provider

#### Scenario: Switch rejected while recording
- **WHEN** PUT `/api/config` attempts to change `asr_provider` while recording is active
- **THEN** the server returns an error response indicating recording must be stopped first

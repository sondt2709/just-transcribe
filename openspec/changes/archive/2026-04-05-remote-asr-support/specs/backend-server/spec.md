## ADDED Requirements

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

## ADDED Requirements

### Requirement: LLM connection test endpoint
The backend SHALL expose `POST /api/llm/test` that accepts `{ url: string, api_key?: string }`, calls `GET {url}/v1/models` on the target server, and returns `{ ok: true, models: string[] }` on success or `{ ok: false, error: string }` on failure. The request SHALL timeout after 10 seconds.

#### Scenario: Successful LLM server test
- **WHEN** a POST to `/api/llm/test` is made with a valid URL pointing to an OpenAI-compatible server
- **THEN** the endpoint returns `{ ok: true, models: ["gpt-4o-mini", ...] }` with the list of available model IDs

#### Scenario: LLM server unreachable
- **WHEN** a POST to `/api/llm/test` is made with an unreachable URL
- **THEN** the endpoint returns `{ ok: false, error: "Connection failed" }` within the timeout period

#### Scenario: LLM server does not support model listing
- **WHEN** a POST to `/api/llm/test` is made and the server returns a non-200 response to `GET /v1/models`
- **THEN** the endpoint returns `{ ok: true, models: [] }` (connection succeeded but no models discovered)

### Requirement: LLM settings UI with test connection flow
The Settings > Translation (LLM) section SHALL display: a Local/Remote toggle (Local on left with "soon" badge, disabled; Remote on right, active), and when Remote is selected: Server URL input with Test button, API Key input with "(optional)" hint, connection status indicator, and a Model dropdown populated after successful test. This layout SHALL match the ASR remote configuration UI pattern.

#### Scenario: Test LLM connection from UI
- **WHEN** the user enters a server URL and clicks "Test"
- **THEN** the frontend calls `POST /api/llm/test` and displays connection status (green dot + "Connected — N model(s) available" or red dot + "Connection failed")

#### Scenario: Model dropdown populated after test
- **WHEN** the LLM connection test succeeds and returns models
- **THEN** the Model field becomes a dropdown populated with the returned model names, with the first model auto-selected if no model was previously configured

#### Scenario: Model fallback to text input
- **WHEN** the LLM connection test succeeds but returns an empty model list
- **THEN** the Model field remains a text input so the user can type a model name manually

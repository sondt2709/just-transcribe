## ADDED Requirements

### Requirement: Automatic translation trigger
The system SHALL automatically translate a transcription segment when its detected language differs from any of the user's configured target languages (`preferred_language` and optionally `preferred_language_2`). Translation SHALL be asynchronous and non-blocking — the original segment is emitted immediately, translations arrive as follow-up events. Each target language SHALL be evaluated independently for skip/translate. The total latency from speech to translated text on screen SHALL be within 5 seconds per translation.

#### Scenario: Segment language differs from both targets
- **WHEN** a segment with `lang: "en"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL asynchronously send two parallel translation requests: one to Vietnamese and one to Chinese

#### Scenario: Segment language matches one target
- **WHEN** a segment with `lang: "vi"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL skip the Vietnamese translation and only translate to Chinese

#### Scenario: Segment language matches sole configured target
- **WHEN** a segment with `lang: "en"` is emitted and `preferred_language` is "en" and `preferred_language_2` is empty
- **THEN** no translation request SHALL be made

### Requirement: OpenAI-compatible LLM API for translation
The system SHALL call an OpenAI-compatible chat completions endpoint (`/v1/chat/completions`) for translation. The API base URL, model name, and API key SHALL be user-configurable.

#### Scenario: Successful translation
- **WHEN** the LLM API returns a translation response
- **THEN** the system emits a `translate` event via WebSocket with the segment ID, translated text, and target language

#### Scenario: LLM API unavailable
- **WHEN** the LLM API request fails or times out
- **THEN** the system SHALL emit an error event and continue transcription without translation — translation failure SHALL NOT block the pipeline

### Requirement: Translation context window
The system SHALL include up to 3 preceding segments as context in the translation prompt to improve coherence (e.g., pronoun resolution, topic continuity).

#### Scenario: Translation with prior context
- **WHEN** translating segment N
- **THEN** the translation prompt SHALL include segments N-3 through N-1 (or fewer if conversation just started) as context for the LLM

### Requirement: Translation latency budget
The total time from speech to translated text appearing on screen SHALL NOT exceed 5 seconds under normal conditions (transcription 0.5-2s + LLM API 1-3s). If the LLM API response exceeds 5 seconds, the translation SHALL still be displayed when it arrives — it SHALL NOT be discarded.

#### Scenario: Translation within latency budget
- **WHEN** the LLM API responds within 3 seconds
- **THEN** the translated text appears on screen within 5 seconds of the original speech

#### Scenario: Translation exceeds latency budget
- **WHEN** the LLM API response takes longer than 3 seconds
- **THEN** the translation SHALL still be displayed when it arrives, with no visual indication of being "late"

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

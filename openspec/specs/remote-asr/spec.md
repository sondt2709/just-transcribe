## Purpose

Defines requirements for remote ASR transcription via OpenAI-compatible HTTP API, including connection testing, model discovery, retry logic, and timeout handling.

## Requirements

### Requirement: Remote ASR transcription via HTTP
The system SHALL support transcribing audio segments by sending them to a remote OpenAI-compatible ASR server via `POST {asr_base_url}/v1/audio/transcriptions` as multipart form data with fields: `file` (WAV audio), `model` (selected model ID), and `language` (optional, omitted when auto-detect).

#### Scenario: Transcribe a speech segment via remote server
- **WHEN** the ASR provider is set to "remote" and a finalized speech segment is ready for transcription
- **THEN** the system SHALL encode the float32 audio to WAV (PCM_16, 16kHz, mono) in-memory, POST it to `/v1/audio/transcriptions`, and return a TranscriptSegment with text, detected language, and timing

#### Scenario: Transcribe with explicit language hint
- **WHEN** the user has configured a specific ASR language (not auto-detect)
- **THEN** the system SHALL include the `language` field in the multipart form data

#### Scenario: Transcribe with auto-detect language
- **WHEN** the ASR language is set to auto-detect (empty string)
- **THEN** the system SHALL omit the `language` field from the request, letting the server detect language

### Requirement: Remote ASR interim transcription
The system SHALL support interim (partial) transcription with the remote provider using the same HTTP endpoint. The orchestrator's 0.5s interim loop SHALL send accumulated audio to the remote server identically to final segments.

#### Scenario: Interim transcription via remote
- **WHEN** the interim loop fires and there is pending audio for a source
- **THEN** the system SHALL send the accumulated audio to the remote server and emit an interim event with the partial text

### Requirement: Connection testing
The system SHALL provide a mechanism to test connectivity to a remote ASR server by calling `GET {url}/v1/models`. A successful response confirms the server is reachable and compatible.

#### Scenario: Successful connection test
- **WHEN** the user provides a valid remote ASR URL and the server responds to `GET /v1/models` with a 200 status
- **THEN** the system SHALL return success with the list of available model IDs

#### Scenario: Failed connection test — server unreachable
- **WHEN** the user provides a URL and the server does not respond (connection refused, timeout, DNS failure)
- **THEN** the system SHALL return failure with a descriptive error message

#### Scenario: Failed connection test — invalid response
- **WHEN** the server responds with a non-200 status or invalid JSON
- **THEN** the system SHALL return failure with the HTTP status code and error details

### Requirement: Model discovery
The system SHALL discover available models on a remote ASR server by parsing the response from `GET {url}/v1/models`. The response follows the OpenAI format: `{"data": [{"id": "model-name"}, ...]}`.

#### Scenario: Models listed successfully
- **WHEN** the server returns a valid model list
- **THEN** the system SHALL extract model IDs from the `data` array and return them as a list

#### Scenario: Empty model list
- **WHEN** the server returns `{"data": []}`
- **THEN** the system SHALL return an empty list and the UI SHALL show an appropriate message

### Requirement: Retry on transient failures
The system SHALL retry remote ASR requests once on transient HTTP errors (status 429, 500, 502, 503) or connection errors, with exponential backoff starting at 1 second.

#### Scenario: Transient server error with recovery
- **WHEN** the first request returns HTTP 502 and the retry succeeds
- **THEN** the system SHALL return the successful transcription result

#### Scenario: Persistent server error
- **WHEN** both the initial request and retry fail
- **THEN** the system SHALL surface the error via WebSocket error event

#### Scenario: Client error — no retry
- **WHEN** the server returns HTTP 400 or 404
- **THEN** the system SHALL NOT retry and SHALL immediately surface the error

### Requirement: Remote provider is always "loaded"
The remote ASR provider SHALL report `is_loaded() = True` at all times, since no local model loading is required. The provider is considered ready as soon as configuration (URL + model) is set.

#### Scenario: Check remote provider readiness
- **WHEN** the system queries whether the ASR provider is loaded
- **THEN** the remote provider SHALL return True without performing any network call

### Requirement: HTTP request timeout
Each remote ASR HTTP request SHALL use a 30-second timeout. If the server does not respond within this window, the request SHALL be treated as a transient failure (eligible for retry).

#### Scenario: Server response timeout
- **WHEN** the remote server does not respond within 30 seconds
- **THEN** the system SHALL treat it as a transient failure and retry once

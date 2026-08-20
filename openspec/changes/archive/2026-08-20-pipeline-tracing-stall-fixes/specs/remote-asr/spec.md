# remote-asr (delta)

## MODIFIED Requirements

### Requirement: HTTP request timeout
Each remote ASR HTTP request SHALL use a configurable timeout from config field `asr_timeout_s` (default 10 seconds). If the server does not respond within this window, the request SHALL be treated as a transient failure (eligible for retry). Remote ASR requests SHALL NOT be serialized by a global orchestrator lock.

#### Scenario: Server response timeout
- **WHEN** the remote server does not respond within `asr_timeout_s` seconds
- **THEN** the system SHALL treat it as a transient failure and retry once

#### Scenario: Timeout configured by user
- **WHEN** the user sets `asr_timeout_s = 5` in settings
- **THEN** subsequent remote ASR requests time out after 5 seconds

#### Scenario: Default timeout
- **WHEN** `asr_timeout_s` is absent from config.toml
- **THEN** remote ASR requests use a 10-second timeout

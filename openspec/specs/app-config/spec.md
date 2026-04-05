## ADDED Requirements

### Requirement: App directory structure
The system SHALL use `~/.just-transcribe/` as the application home directory with the following structure: `bin/` for native binaries, `python/` for the Python application source, `logs/` for log files, and `config.toml` for user configuration.

#### Scenario: First launch creates directory structure
- **WHEN** the app launches and `~/.just-transcribe/` does not exist
- **THEN** the system creates the directory structure: `bin/`, `python/`, `logs/`

#### Scenario: audiotee binary installation
- **WHEN** `~/.just-transcribe/bin/audiotee` does not exist
- **THEN** the Electron app copies the bundled audiotee binary from its resources to `~/.just-transcribe/bin/audiotee` and makes it executable

### Requirement: User configuration file
The system SHALL store user preferences in `~/.just-transcribe/config.toml` with the following configurable fields: preferred language, LLM API base URL, LLM model name, LLM API key, and audio source preferences (mic enabled, speaker enabled).

#### Scenario: Default configuration
- **WHEN** `config.toml` does not exist
- **THEN** the system uses defaults: preferred language "en", no LLM API configured, both mic and speaker enabled

#### Scenario: Configuration persistence
- **WHEN** the user changes settings via the UI
- **THEN** the changes are written to `config.toml` and survive app restarts

### Requirement: Model storage in standard HuggingFace cache
AI models SHALL be stored in the standard HuggingFace cache directory (`~/.cache/huggingface/`). The system SHALL NOT use a custom model directory.

#### Scenario: Model cache check
- **WHEN** the system checks for model availability
- **THEN** it looks in `~/.cache/huggingface/hub/` for the model directories

### Requirement: Log output
The Python backend SHALL write logs to `~/.just-transcribe/logs/backend.log` with rotation. The log SHALL include timestamps, log level, and module name.

#### Scenario: Log file created on startup
- **WHEN** the Python backend starts
- **THEN** it creates or appends to `~/.just-transcribe/logs/backend.log`

#### Scenario: Log rotation
- **WHEN** the log file exceeds 10MB
- **THEN** the system rotates the log file, keeping the 3 most recent files

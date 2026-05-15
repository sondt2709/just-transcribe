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
The system SHALL store user preferences in `~/.just-transcribe/config.toml` with the following configurable fields: preferred language, **secondary preferred language (optional)**, ASR provider ("local" or "remote"), ASR model name, ASR base URL (for remote provider), ASR API key (for remote provider), ASR language hint, LLM API base URL, LLM model name, LLM API key, and audio source preferences (mic enabled, speaker enabled).

The frontend SHALL cache local and remote ASR configuration values independently in component state. When the user switches between local and remote providers, the previously entered values for each provider SHALL be preserved in memory. On save, only the active provider's values SHALL be written to the backend config.

#### Scenario: Default configuration
- **WHEN** `config.toml` does not exist
- **THEN** the system uses defaults: preferred language "en", **secondary preferred language "" (disabled)**, ASR provider "local", ASR model "Qwen/Qwen3-ASR-1.7B", empty ASR base URL, empty ASR API key, empty ASR language (auto-detect), no LLM API configured, both mic and speaker enabled

#### Scenario: Configuration persistence
- **WHEN** the user changes settings via the UI (including secondary preferred language)
- **THEN** the changes are written to `config.toml` and survive app restarts

#### Scenario: Secondary language disabled
- **WHEN** `preferred_language_2` is empty or not present in config.toml
- **THEN** the system SHALL only translate to `preferred_language` (single-language behavior)

#### Scenario: Remote ASR configuration
- **WHEN** the user sets `asr_provider = "remote"` with a valid `asr_base_url` and `asr_model`
- **THEN** the system uses the remote ASR engine for transcription on next start or config update

#### Scenario: Switch provider via config update
- **WHEN** the user changes `asr_provider` via PUT `/api/config` while not recording
- **THEN** the system re-initializes the ASR provider (unloading local model if switching to remote, loading it if switching to local)

#### Scenario: Switching ASR provider preserves cached values
- **WHEN** the user enters remote ASR config (URL, API key, model), switches to local, enters a local model name, then switches back to remote
- **THEN** the remote ASR config fields SHALL still contain the previously entered values

#### Scenario: Save writes only active provider values
- **WHEN** the user has local ASR selected with model "custom-model" and cached remote values exist
- **THEN** saving SHALL write `asr_model = "custom-model"` and empty `asr_base_url`/`asr_api_key` to the backend config

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

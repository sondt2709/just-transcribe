## MODIFIED Requirements

### Requirement: User configuration file
The system SHALL store user preferences in `~/.just-transcribe/config.toml` with the following configurable fields: preferred language, ASR provider ("local" or "remote"), ASR model name, ASR base URL (for remote provider), ASR API key (for remote provider), ASR language hint, LLM API base URL, LLM model name, LLM API key, and audio source preferences (mic enabled, speaker enabled).

The frontend SHALL cache local and remote ASR configuration values independently in component state. When the user switches between local and remote providers, the previously entered values for each provider SHALL be preserved in memory. On save, only the active provider's values SHALL be written to the backend config.

#### Scenario: Default configuration
- **WHEN** `config.toml` does not exist
- **THEN** the system uses defaults: preferred language "en", ASR provider "local", ASR model "Qwen/Qwen3-ASR-1.7B", empty ASR base URL, empty ASR API key, empty ASR language (auto-detect), no LLM API configured, both mic and speaker enabled

#### Scenario: Configuration persistence
- **WHEN** the user changes settings via the UI
- **THEN** the changes are written to `config.toml` and survive app restarts

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

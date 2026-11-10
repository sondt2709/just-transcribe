## MODIFIED Requirements

### Requirement: User configuration file
The system SHALL store user preferences in `~/.just-transcribe/config.toml` with the following configurable fields: preferred language, secondary preferred language (optional), ASR provider ("local" or "remote"), ASR model name, ASR base URL (for remote provider), ASR API key (for remote provider), ASR language hint, ASR request timeout in seconds (`asr_timeout_s`, default 10), LLM API base URL, LLM model name, LLM API key, audio source preferences (mic enabled, speaker enabled), audio debug recording flag (`debug_audio`, default false), **summary trigger mode (`summary_mode`, "auto" or "manual", default "auto"), summary debounce in seconds (`summary_debounce_s`, default 10), minimum new segments for an automatic summary (`summary_min_segments`, default 2), summary window in seconds (`summary_window_s`, default 600), summary overlap in seconds (`summary_overlap_s`, default 60), and summary prompt template (`summary_prompt`, default "" = built-in template)**. The summary session context SHALL NOT be stored in `config.toml`.

The frontend SHALL cache local and remote ASR configuration values independently in component state. When the user switches between local and remote providers, the previously entered values for each provider SHALL be preserved in memory. On save, only the active provider's values SHALL be written to the backend config.

#### Scenario: Default configuration
- **WHEN** `config.toml` does not exist
- **THEN** the system uses defaults: preferred language "en", secondary preferred language "" (disabled), ASR provider "local", ASR model "Qwen/Qwen3-ASR-1.7B", empty ASR base URL, empty ASR API key, empty ASR language (auto-detect), `asr_timeout_s` 10, no LLM API configured, both mic and speaker enabled, `debug_audio` false, **`summary_mode` "auto", `summary_debounce_s` 10, `summary_min_segments` 2, `summary_window_s` 600, `summary_overlap_s` 60, `summary_prompt` ""**

#### Scenario: Configuration persistence
- **WHEN** the user changes settings via the UI (including secondary preferred language, ASR timeout, debug audio flag, **and the AI Summary settings**)
- **THEN** the changes are written to `config.toml` and survive app restarts

#### Scenario: Old config without summary keys
- **WHEN** `config.toml` was written by an older version and has no `summary_*` keys
- **THEN** the system loads it without error and uses the summary defaults

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

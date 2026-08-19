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

### Requirement: Overlay position configuration
The config.toml file SHALL include an `overlay_position` field that stores the user's preferred overlay window position. Valid values SHALL be: "top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right". The default value SHALL be "bottom-center".

#### Scenario: Default overlay position
- **WHEN** config.toml does not contain `overlay_position`
- **THEN** the system uses "bottom-center" as the default

#### Scenario: Save overlay position
- **WHEN** the user selects a new overlay position in settings
- **THEN** the `overlay_position` value is written to config.toml

#### Scenario: Invalid overlay position in config
- **WHEN** config.toml contains an invalid `overlay_position` value
- **THEN** the system falls back to "bottom-center"

### Requirement: Overlay enabled state configuration
The config.toml file SHALL include an `overlay_enabled` boolean field that tracks whether the user prefers overlay mode or main window mode. The default SHALL be `false` (main window mode).

#### Scenario: Default mode is main window
- **WHEN** config.toml does not contain `overlay_enabled`
- **THEN** the app starts in main window mode

#### Scenario: Persist overlay mode preference
- **WHEN** the user switches to overlay mode
- **THEN** `overlay_enabled = true` is written to config.toml so the next launch remembers the preference

#### Scenario: Restore mode on launch
- **WHEN** the app launches with `overlay_enabled = true` in config.toml
- **THEN** the app starts in overlay mode (overlay window shown when recording begins, no main window)

### Requirement: Launch at login configuration
The config.toml file SHALL include a `launch_at_login` boolean field. The default SHALL be `false`. This field SHALL be read by the Electron main process to register or unregister the app as a macOS login item.

#### Scenario: Default no launch at login
- **WHEN** config.toml does not contain `launch_at_login`
- **THEN** the app does not register as a login item

#### Scenario: Enable launch at login
- **WHEN** the user sets `launch_at_login = true` in settings
- **THEN** the value is saved to config.toml and the app registers as a macOS login item

#### Scenario: Disable launch at login
- **WHEN** the user sets `launch_at_login = false` in settings
- **THEN** the value is saved to config.toml and the app unregisters from macOS login items

### Requirement: Electron-only config fields
The overlay_position, overlay_enabled, and launch_at_login fields SHALL be read and written directly by the Electron main process. These fields SHALL NOT be exposed through the Python backend's `/api/config` endpoint, as they are purely Electron-side concerns.

#### Scenario: Config fields not in backend API
- **WHEN** the Python backend reads config.toml for its own configuration
- **THEN** it ignores overlay_position, overlay_enabled, and launch_at_login fields

#### Scenario: Electron reads config directly
- **WHEN** the Electron main process needs overlay or launch settings
- **THEN** it reads config.toml directly from `~/.just-transcribe/config.toml` without going through the backend API

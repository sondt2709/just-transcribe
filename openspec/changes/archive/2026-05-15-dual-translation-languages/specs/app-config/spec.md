## MODIFIED Requirements

### Requirement: User configuration file
The system SHALL store user preferences in `~/.just-transcribe/config.toml` with the following configurable fields: preferred language, **secondary preferred language (optional)**, ASR provider ("local" or "remote"), ASR model name, ASR base URL (for remote provider), ASR API key (for remote provider), ASR language hint, LLM API base URL, LLM model name, LLM API key, and audio source preferences (mic enabled, speaker enabled).

#### Scenario: Default configuration
- **WHEN** `config.toml` does not exist
- **THEN** the system uses defaults: preferred language "en", **secondary preferred language "" (disabled)**, ASR provider "local", ASR model "Qwen/Qwen3-ASR-1.7B", empty ASR base URL, empty ASR API key, empty ASR language (auto-detect), no LLM API configured, both mic and speaker enabled

#### Scenario: Configuration persistence
- **WHEN** the user changes settings via the UI (including secondary preferred language)
- **THEN** the changes are written to `config.toml` and survive app restarts

#### Scenario: Secondary language disabled
- **WHEN** `preferred_language_2` is empty or not present in config.toml
- **THEN** the system SHALL only translate to `preferred_language` (single-language behavior)

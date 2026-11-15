## ADDED Requirements

### Requirement: Call microphone settings
`config.toml` SHALL store `call_mic_enabled` (default false) and `call_mic_mode` (`voice_and_translation` or `translation_only`, default `voice_and_translation`). An unknown mode SHALL load as the default. A file without these keys SHALL load with the defaults.

#### Scenario: Old config file
- **WHEN** `config.toml` has no `call_mic_*` keys
- **THEN** `call_mic_enabled` is false and `call_mic_mode` is `voice_and_translation`

#### Scenario: Invalid mode
- **WHEN** `call_mic_mode = "loud"`
- **THEN** the mode loads as `voice_and_translation`

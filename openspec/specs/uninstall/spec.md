## Purpose

TBD — Defines requirements for providing users with clear uninstall instructions and independent component removal.

## Requirements

### Requirement: Uninstall instructions in Settings
The Settings panel SHALL include an "Uninstall" section that lists commands to remove each component independently.

#### Scenario: User views uninstall options
- **WHEN** the user opens Settings and scrolls to the Uninstall section
- **THEN** the UI displays three removal levels with copy-pasteable terminal commands:
  - Remove app: `rm -rf /Applications/Just\ Transcribe.app`
  - Remove app data: `rm -rf ~/.just-transcribe` and `rm -rf ~/Library/Application\ Support/just-transcribe`
  - Remove model: `rm -rf ~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B`

### Requirement: Independent component removal
Each uninstall level SHALL be independent — removing app data SHALL NOT require removing the app first, and removing the model SHALL NOT require removing app data.

#### Scenario: Remove only app data
- **WHEN** the user runs `rm -rf ~/.just-transcribe`
- **THEN** the next app launch shows the setup screen again (fresh setup), but the model remains cached

#### Scenario: Remove only model cache
- **WHEN** the user removes `~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B`
- **THEN** the app detects model is missing on next launch and shows the setup screen with model download instructions

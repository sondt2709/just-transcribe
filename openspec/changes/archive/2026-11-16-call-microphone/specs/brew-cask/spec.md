## ADDED Requirements

### Requirement: Cask removes the call microphone on zap
The cask SHALL remove `/Library/Audio/Plug-Ins/HAL/JustTranscribeMic.driver` (with sudo) and restart Core Audio in its `zap` stanza, only when the driver is installed. The cask SHALL NOT remove the driver in an `uninstall` stanza, because `brew upgrade` runs the old version's `uninstall` stanza. The caveats SHALL give the zap command. The release workflow SHALL keep editing only the `version` and `sha256` lines.

#### Scenario: Zap with the driver installed
- **WHEN** the driver is installed and the user runs `brew uninstall --zap just-transcribe`
- **THEN** the app, the app data and the driver are removed, and Core Audio restarts

#### Scenario: Zap without the driver
- **WHEN** the driver is not installed and the user runs `brew uninstall --zap just-transcribe`
- **THEN** the uninstall succeeds and Core Audio does not restart

#### Scenario: Upgrade keeps the driver
- **WHEN** the driver is installed and the user runs `brew upgrade --cask just-transcribe`
- **THEN** the driver stays installed and Core Audio does not restart

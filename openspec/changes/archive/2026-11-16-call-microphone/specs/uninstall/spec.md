## ADDED Requirements

### Requirement: Remove the call microphone
The Uninstall section SHALL list the command to remove the call microphone driver: `sudo rm -rf /Library/Audio/Plug-Ins/HAL/JustTranscribeMic.driver && sudo killall coreaudiod`. Removing it SHALL NOT require removing the app, the app data or the models.

#### Scenario: Remove only the driver
- **WHEN** the user runs the remove command
- **THEN** "Just Transcribe Microphone" is no longer listed, the app still runs, and Settings shows the driver as not installed

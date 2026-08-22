## ADDED Requirements

### Requirement: Tray icon resources bundled in DMG
The packaged app SHALL include the tray icon assets (`trayIdleTemplate.png`, `trayIdleTemplate@2x.png`, `trayRecording.png`, `trayRecording@2x.png`) in `Contents/Resources/` via electron-builder `extraResources`, matching the path the main process resolves at runtime (`process.resourcesPath`).

#### Scenario: Tray assets present in built app bundle
- **WHEN** `electron-builder --mac` produces the app bundle
- **THEN** `Contents/Resources/` contains the four tray icon PNG files

## ADDED Requirements

### Requirement: Tray icon visible in packaged builds
The tray icon image files SHALL be present in the packaged app's resources so that `nativeImage.createFromPath` loads a non-empty image in production. The idle icon SHALL remain a macOS template image so it adapts to the menu bar's light/dark appearance.

#### Scenario: Icon renders after DMG/Homebrew install
- **WHEN** the app is installed from the DMG or Homebrew cask and launched
- **THEN** the tray icon is visibly rendered in the menu bar (not a transparent/empty clickable area)

#### Scenario: Idle icon adapts to menu bar appearance
- **WHEN** macOS switches between light and dark menu bar appearance
- **THEN** the idle tray icon remains legible (template image inverts automatically)

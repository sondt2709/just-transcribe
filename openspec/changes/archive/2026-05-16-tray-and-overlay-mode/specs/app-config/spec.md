## ADDED Requirements

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

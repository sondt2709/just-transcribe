## ADDED Requirements

### Requirement: Overlay click-through configuration
The config.toml file SHALL include an `overlay_click_through` boolean field that stores whether the overlay is locked in click-through mode. The default SHALL be `false` (interactive). The field SHALL be read and written directly by the Electron main process and SHALL NOT be exposed through the Python backend's `/api/config` endpoint.

#### Scenario: Default is interactive
- **WHEN** config.toml does not contain `overlay_click_through`
- **THEN** the overlay starts in interactive mode

#### Scenario: Persist click-through preference
- **WHEN** the user toggles the overlay interaction mode (via tray menu or overlay lock button)
- **THEN** the new `overlay_click_through` value is written to config.toml

#### Scenario: Invalid value falls back to default
- **WHEN** config.toml contains an unparseable `overlay_click_through` value
- **THEN** the system falls back to `false` (interactive)

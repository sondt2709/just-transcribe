## ADDED Requirements

### Requirement: Optional call microphone step
The setup screen SHALL show an optional "Call microphone" step that explains that it lets others in a call hear the spoken translation, that it needs the administrator password, and that all sound stops for about 2 seconds. It SHALL have an Install button, and SHALL show as complete when the driver is installed. The step SHALL NOT block "Run Setup" or the ready state.

#### Scenario: Not installed
- **WHEN** the driver is not installed
- **THEN** the setup screen shows the optional step with Install, and "Run Setup" stays enabled when the required steps are complete

#### Scenario: Installed
- **WHEN** the driver is installed
- **THEN** the optional step shows as complete

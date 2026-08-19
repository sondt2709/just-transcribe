### Requirement: Transparent overlay window
The app SHALL provide a transparent, frameless, always-on-top overlay window for displaying live captions. The overlay window SHALL have no title bar, no shadow, a fully transparent background, and SHALL float above all other windows.

#### Scenario: Overlay window creation
- **WHEN** the user switches to overlay mode
- **THEN** a new BrowserWindow is created with `transparent: true`, `frame: false`, `alwaysOnTop: true`, `hasShadow: false`, `skipTaskbar: true`

#### Scenario: Overlay window transparency
- **WHEN** the overlay window is displayed
- **THEN** areas without caption text are fully transparent and show the desktop/apps underneath

### Requirement: Overlay caption rendering
The overlay SHALL display the most recent transcript segments with compact styling. It SHALL show 5-10 lines of text including original transcription and translations. The text SHALL be rendered with a semi-transparent dark background behind each line for readability, with small UI-appropriate font size.

#### Scenario: Live caption display
- **WHEN** a new transcript segment arrives via IPC from the main process
- **THEN** the overlay appends the segment text and scrolls to show the most recent content, keeping at most 10 lines visible

#### Scenario: Translation display in overlay
- **WHEN** a segment has associated translations
- **THEN** the overlay shows the translation text below the original with a distinct but compact style

#### Scenario: Interim text display in overlay
- **WHEN** an interim (partial) transcript arrives
- **THEN** the overlay shows it in a dimmed/italic style that updates in place

#### Scenario: No transcript data
- **WHEN** the overlay is visible but no transcript segments exist
- **THEN** the overlay shows a minimal "Listening..." indicator

### Requirement: 9-position overlay placement
The overlay window SHALL support 9 placement positions arranged in a 3x3 grid: top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right. The default position SHALL be bottom-center. The position SHALL be configurable in settings and persisted in config.toml.

#### Scenario: Default position
- **WHEN** the overlay is shown for the first time with no saved preference
- **THEN** the overlay appears at the bottom-center of the primary display's work area

#### Scenario: User changes position
- **WHEN** the user selects a different position in the settings 3x3 grid picker
- **THEN** the overlay moves to the new position immediately and the preference is saved to config.toml

#### Scenario: Position persistence
- **WHEN** the app restarts and the user had previously set overlay position to "top-right"
- **THEN** the overlay appears at top-right when next shown

#### Scenario: Position calculation
- **WHEN** the overlay is positioned at any of the 9 grid positions
- **THEN** the overlay window is sized to ~60% of screen width and ~15% of screen height, and placed at the corresponding grid position within the primary display's work area (accounting for menu bar and dock)

### Requirement: Click-through overlay
The overlay window SHALL be click-through by default, allowing the user to interact with applications underneath. Mouse events SHALL pass through to the windows below.

#### Scenario: Click-through behavior
- **WHEN** the user clicks on an area where the overlay is displayed
- **THEN** the click passes through to the application underneath the overlay

#### Scenario: Overlay does not steal focus
- **WHEN** the overlay is visible and the user is typing in another application
- **THEN** the overlay does not intercept keyboard input or steal focus

### Requirement: Exclusive window mode
The main window and overlay window SHALL be mutually exclusive. Only one SHALL be visible at a time. Switching between modes hides one and shows the other.

#### Scenario: Switch from main to overlay
- **WHEN** the user activates overlay mode (via tray menu)
- **THEN** the main window hides and the overlay window appears at the configured position

#### Scenario: Switch from overlay to main
- **WHEN** the user activates main window mode (via tray menu)
- **THEN** the overlay window hides and the main window shows

#### Scenario: Mode persists across recording sessions
- **WHEN** the user is in overlay mode and stops then starts recording again
- **THEN** the overlay remains the active display mode

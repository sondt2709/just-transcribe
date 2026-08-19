## MODIFIED Requirements

### Requirement: Tray context menu
The tray icon SHALL display a context menu on click with the following items: Start/Stop Recording (toggles based on current state), Show Main Window or Show Overlay (switches active mode), an overlay interaction toggle (only while overlay mode is active): "Lock Overlay (Click-Through)" or "Unlock Overlay (Interactive)" (toggles based on current interaction mode), a separator, Settings (opens main window with settings visible), and Quit.

#### Scenario: Context menu when idle in main window mode
- **WHEN** the user clicks the tray icon while not recording and main window mode is active
- **THEN** the context menu shows: "Start Recording", "Show Overlay", separator, "Settings", "Quit"

#### Scenario: Context menu when recording in overlay mode
- **WHEN** the user clicks the tray icon while recording and overlay mode is active in interactive mode
- **THEN** the context menu shows: "Stop Recording", "Show Main Window", "Lock Overlay (Click-Through)", separator, "Settings", "Quit"

#### Scenario: Context menu when overlay is click-through
- **WHEN** the user clicks the tray icon while overlay mode is active and click-through is enabled
- **THEN** the context menu shows "Unlock Overlay (Interactive)" in place of the lock item

#### Scenario: Start recording from tray
- **WHEN** the user clicks "Start Recording" in the tray context menu
- **THEN** the app starts recording via POST `/api/start` and updates the tray icon to recording state

#### Scenario: Stop recording from tray
- **WHEN** the user clicks "Stop Recording" in the tray context menu
- **THEN** the app stops recording via POST `/api/stop` and updates the tray icon to idle state

#### Scenario: Switch to overlay from tray
- **WHEN** the user clicks "Show Overlay" in the tray context menu
- **THEN** the main window hides and the overlay window appears

#### Scenario: Switch to main window from tray
- **WHEN** the user clicks "Show Main Window" in the tray context menu
- **THEN** the overlay window hides and the main window shows

#### Scenario: Quit from tray
- **WHEN** the user clicks "Quit" in the tray context menu
- **THEN** the app stops recording (if active), kills the Python backend, and exits

#### Scenario: Open settings from tray
- **WHEN** the user clicks "Settings" in the tray context menu
- **THEN** the main window shows with the settings panel visible

#### Scenario: Lock overlay from tray
- **WHEN** the user clicks "Lock Overlay (Click-Through)" in the tray context menu
- **THEN** the overlay becomes click-through and the menu item changes to "Unlock Overlay (Interactive)"

#### Scenario: Unlock overlay from tray
- **WHEN** the user clicks "Unlock Overlay (Interactive)" in the tray context menu
- **THEN** the overlay becomes draggable/resizable and the menu item changes to "Lock Overlay (Click-Through)"

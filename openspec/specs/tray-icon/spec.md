### Requirement: System tray icon
The Electron app SHALL create a system tray icon on app launch. The tray icon SHALL remain visible as long as the app is running. The tray icon SHALL use a microphone-style icon that visually distinguishes between idle and recording states.

#### Scenario: Tray icon created on launch
- **WHEN** the Electron app finishes initialization
- **THEN** a tray icon appears in the macOS menu bar with an idle-state icon

#### Scenario: Tray icon reflects recording state
- **WHEN** the user starts recording
- **THEN** the tray icon changes to a recording-state variant (e.g., filled microphone)

#### Scenario: Tray icon reflects idle state
- **WHEN** the user stops recording
- **THEN** the tray icon changes back to the idle-state variant

### Requirement: Tray context menu
The tray icon SHALL display a context menu on click with the following items: Start/Stop Recording (toggles based on current state), Show Main Window or Show Overlay (switches active mode), a separator, Settings (opens main window with settings visible), and Quit.

#### Scenario: Context menu when idle in main window mode
- **WHEN** the user clicks the tray icon while not recording and main window mode is active
- **THEN** the context menu shows: "Start Recording", "Show Overlay", separator, "Settings", "Quit"

#### Scenario: Context menu when recording in overlay mode
- **WHEN** the user clicks the tray icon while recording and overlay mode is active
- **THEN** the context menu shows: "Stop Recording", "Show Main Window", separator, "Settings", "Quit"

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

### Requirement: Tray-only recording flow
The app SHALL support starting a recording session from the tray without ever showing the main window. When recording starts from the tray while in overlay mode, the overlay window SHALL appear automatically to display captions.

#### Scenario: Record with overlay from cold start
- **WHEN** the app is idle in tray with no windows visible and the user clicks "Start Recording"
- **THEN** recording begins and the overlay window appears showing live captions

#### Scenario: Record with overlay already visible
- **WHEN** the overlay window is visible and the user clicks "Start Recording" from the tray
- **THEN** recording begins and captions appear in the already-visible overlay window

### Requirement: Launch at login
The app SHALL support an optional "Launch at Login" setting. When enabled, the app SHALL start automatically on macOS login, initialize the Python backend, and sit in the tray ready for use.

#### Scenario: Enable launch at login
- **WHEN** the user enables "Launch at Login" in settings
- **THEN** the app registers itself as a login item via `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })`

#### Scenario: Disable launch at login
- **WHEN** the user disables "Launch at Login" in settings
- **THEN** the app removes itself from login items via `app.setLoginItemSettings({ openAtLogin: false })`

#### Scenario: App starts at login
- **WHEN** macOS starts and launch-at-login is enabled
- **THEN** the app launches, starts the Python backend, and appears only as a tray icon (no windows shown)

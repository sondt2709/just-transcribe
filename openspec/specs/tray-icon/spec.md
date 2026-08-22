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

### Requirement: Tray icon visible in packaged builds
The tray icon image files SHALL be present in the packaged app's resources so that `nativeImage.createFromPath` loads a non-empty image in production. The idle icon SHALL remain a macOS template image so it adapts to the menu bar's light/dark appearance.

#### Scenario: Icon renders after DMG/Homebrew install
- **WHEN** the app is installed from the DMG or Homebrew cask and launched
- **THEN** the tray icon is visibly rendered in the menu bar (not a transparent/empty clickable area)

#### Scenario: Idle icon adapts to menu bar appearance
- **WHEN** macOS switches between light and dark menu bar appearance
- **THEN** the idle tray icon remains legible (template image inverts automatically)

## MODIFIED Requirements

### Requirement: Python sidecar lifecycle management
The Electron main process SHALL spawn the Python backend via `uv run python -m just_transcribe --port <PORT>` where PORT is a randomly selected free port. The main process SHALL pipe stdin to the Python process and terminate it on app quit. The backend SHALL remain running when the main window is closed, as long as the app is alive in the system tray.

#### Scenario: App launch starts Python backend
- **WHEN** the Electron app finishes loading
- **THEN** it selects a random free port, spawns the Python sidecar process, and waits for the backend to report ready via stdout

#### Scenario: App quit kills Python backend
- **WHEN** the user quits the Electron app via tray menu "Quit" or Cmd+Q
- **THEN** the main process sends SIGTERM to the Python process and closes the piped stdin, ensuring the backend shuts down

#### Scenario: Python backend crashes
- **WHEN** the Python sidecar process exits unexpectedly
- **THEN** the Electron app SHALL display an error notification and offer to restart the backend

#### Scenario: Backend survives window close
- **WHEN** the user closes the main window (click red button)
- **THEN** the Python backend continues running and the app remains in the system tray

### Requirement: Modern transcript UI
The Electron renderer SHALL display a dashboard-style layout: main transcript area occupying most of the screen, with a sidebar or panel for controls, language detection status, and settings. The transcript view SHALL connect via WebSocket to the Python backend and show segments with speaker labels, timestamps, detected language, and visually prominent inline translations. Translation is a core comprehension tool — it SHALL be displayed prominently alongside original text, not in a secondary/dimmed style.

#### Scenario: Live transcript display
- **WHEN** the WebSocket receives a segment event
- **THEN** the UI appends a new transcript entry showing: speaker label ("You"/"Others"), text, detected language badge, and timestamp

#### Scenario: Translation display
- **WHEN** the WebSocket receives a translate event for an existing segment
- **THEN** the UI updates that segment to show the translation prominently alongside the original text (e.g., indented below with distinct background color, same font size as original)

#### Scenario: Interim text display
- **WHEN** the WebSocket receives an interim event
- **THEN** the UI shows the partial text in a visually distinct style (e.g., dimmed) that updates in place

## ADDED Requirements

### Requirement: Window close hides instead of quit
Closing the main window (clicking the red close button) SHALL hide the window instead of quitting the application. The app SHALL continue running in the system tray. The app SHALL only fully quit when the user selects "Quit" from the tray context menu or uses Cmd+Q.

#### Scenario: Close button hides window
- **WHEN** the user clicks the close button on the main window
- **THEN** the window hides but the app remains running in the tray

#### Scenario: Cmd+Q quits the app
- **WHEN** the user presses Cmd+Q
- **THEN** the app fully quits, stopping recording, killing the backend, and removing the tray icon

#### Scenario: Reopen from tray after close
- **WHEN** the main window is hidden and the user clicks "Show Main Window" in the tray menu
- **THEN** the main window reappears with its previous state intact

### Requirement: WebSocket managed by main process
The main process SHALL own the WebSocket connection to the Python backend. Transcript data SHALL be forwarded to the active window (main or overlay) via IPC. The WebSocket SHALL only be connected while recording is active.

#### Scenario: WebSocket connects on recording start
- **WHEN** the user starts recording (from tray or main window)
- **THEN** the main process opens a WebSocket connection to the Python backend

#### Scenario: WebSocket disconnects on recording stop
- **WHEN** the user stops recording
- **THEN** the main process closes the WebSocket connection

#### Scenario: Transcript data forwarded to active window
- **WHEN** the main process receives transcript data via WebSocket
- **THEN** it forwards the data via IPC to whichever window is currently active (main or overlay)

#### Scenario: No WebSocket when idle
- **WHEN** the app is idle in the tray (not recording)
- **THEN** no WebSocket connection exists to the Python backend

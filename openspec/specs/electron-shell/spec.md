## ADDED Requirements

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

### Requirement: First-launch prerequisite checking
On first launch, the Electron app SHALL verify that required prerequisites are installed: `uv` and `huggingface-cli` (hf). If missing, it SHALL display instructions for installation. The setup screen SHALL also verify that the ASR model is downloaded before allowing the user to proceed to environment setup.

#### Scenario: All prerequisites present
- **WHEN** the app launches and detects `uv` and `hf` CLI in PATH
- **THEN** it proceeds to check model download status and Python environment status

#### Scenario: uv not installed
- **WHEN** the app cannot find `uv` in PATH
- **THEN** it displays a setup screen with the instruction: `curl -LsSf https://astral.sh/uv/install.sh | sh`

#### Scenario: huggingface-cli not installed
- **WHEN** the app cannot find `hf` in PATH
- **THEN** it displays a setup screen with the instruction: `brew install huggingface-cli` or `uv tool install huggingface-cli`

#### Scenario: Model not downloaded
- **WHEN** uv and hf are installed but `~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B` does not exist
- **THEN** it displays the model download step with instruction: `hf download Qwen/Qwen3-ASR-1.7B`

### Requirement: Python environment setup
On first launch (or when `~/.just-transcribe/python/` is missing), the Electron app SHALL set up the Python environment by running `uv sync` in the Python app directory. In production, the app SHALL record the app version in a marker file (`~/.just-transcribe/python/.app-version`) after a successful source copy and sync, and SHALL refresh the installed backend (re-copy bundled source, re-run `uv sync`, update the marker) whenever the marker is missing or differs from the running app version. The "Reinstall backend" action SHALL wait for the running backend process to exit, re-copy the bundled Python source, re-run `uv sync`, and restart the backend.

#### Scenario: First-time Python setup
- **WHEN** `~/.just-transcribe/.venv/` does not exist
- **THEN** the app copies the Python source to `~/.just-transcribe/python/`, runs `uv sync`, and shows progress

#### Scenario: Python environment already exists
- **WHEN** `~/.just-transcribe/.venv/` exists and is valid and the version marker matches the running app version
- **THEN** the app skips setup and proceeds to launch the backend

#### Scenario: App upgraded since backend install
- **WHEN** the app starts in production and `~/.just-transcribe/python/.app-version` is missing or differs from the running app version
- **THEN** the app re-copies the bundled Python source, re-runs `uv sync`, writes the current version to the marker, and only then starts the backend

#### Scenario: User triggers backend reinstall
- **WHEN** the user activates "Reinstall backend" in Settings
- **THEN** the app waits for the running backend process to exit, re-copies the bundled Python source, re-runs `uv sync`, restarts the backend, and reports success or the specific error

### Requirement: Model download management
The Electron app SHALL check if required models are downloaded. If not, it SHALL display download instructions. The model download is a user-initiated terminal action, not an automated in-app process.

#### Scenario: Models not downloaded
- **WHEN** the Qwen3-ASR 1.7B model is not found in `~/.cache/huggingface/`
- **THEN** the app displays the download command `hf download Qwen/Qwen3-ASR-1.7B` with expected size info

#### Scenario: Models already present
- **WHEN** required models exist in cache
- **THEN** the app marks model download as complete and enables environment setup

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

### Requirement: Recording controls
The UI SHALL provide start/stop controls and a settings panel for configuring audio sources, preferred language, and LLM API settings.

#### Scenario: Start recording
- **WHEN** the user clicks the start button
- **THEN** the UI sends POST `/api/start` with the configured audio sources and transitions to the recording state

#### Scenario: Stop recording
- **WHEN** the user clicks the stop button
- **THEN** the UI sends POST `/api/stop` and transitions to the idle state

#### Scenario: Configure LLM settings
- **WHEN** the user opens settings and enters LLM API base URL, model name, and API key
- **THEN** the settings are saved to `~/.just-transcribe/config.toml` and applied on next recording start

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

### Requirement: Stall and error banner
The renderer SHALL display a visible, dismissible banner when the backend broadcasts an `error` or `stall` WebSocket event, showing the message. The banner SHALL clear automatically when a subsequent `segment` or `interim` event arrives (pipeline recovered) or when the user dismisses it. Errors SHALL NOT be reported only to the developer console.

#### Scenario: Stall banner shown
- **WHEN** the WebSocket receives `{ "type": "stall", "message": "..." }`
- **THEN** the UI shows a warning banner with the message while the transcript view remains usable

#### Scenario: Banner auto-clears on recovery
- **WHEN** a banner is visible and a new `segment` or `interim` event arrives
- **THEN** the banner is removed automatically

#### Scenario: Error banner shown
- **WHEN** the WebSocket receives `{ "type": "error", "message": "..." }`
- **THEN** the UI shows an error banner with the message

## ADDED Requirements

### Requirement: Python sidecar lifecycle management
The Electron main process SHALL spawn the Python backend via `uv run python -m just_transcribe --port <PORT>` where PORT is a randomly selected free port. The main process SHALL pipe stdin to the Python process and terminate it on app quit.

#### Scenario: App launch starts Python backend
- **WHEN** the Electron app finishes loading
- **THEN** it selects a random free port, spawns the Python sidecar process, and waits for the backend to report ready via stdout

#### Scenario: App quit kills Python backend
- **WHEN** the user quits the Electron app
- **THEN** the main process sends SIGTERM to the Python process and closes the piped stdin, ensuring the backend shuts down

#### Scenario: Python backend crashes
- **WHEN** the Python sidecar process exits unexpectedly
- **THEN** the Electron app SHALL display an error notification and offer to restart the backend

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
On first launch (or when `~/.just-transcribe/python/` is missing), the Electron app SHALL set up the Python environment by running `uv sync` in the Python app directory.

#### Scenario: First-time Python setup
- **WHEN** `~/.just-transcribe/.venv/` does not exist
- **THEN** the app copies the Python source to `~/.just-transcribe/python/`, runs `uv sync`, and shows progress

#### Scenario: Python environment already exists
- **WHEN** `~/.just-transcribe/.venv/` exists and is valid
- **THEN** the app skips setup and proceeds to launch the backend

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

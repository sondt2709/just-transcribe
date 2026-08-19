## MODIFIED Requirements

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

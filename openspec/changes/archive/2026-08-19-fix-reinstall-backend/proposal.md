## Why

The installed backend at `~/.just-transcribe/python/` is copied from the app bundle only once, on first setup. Two paths that users reasonably expect to refresh it do nothing: (1) launching a newer app version skips the copy because `checkSetupStatus` treats an existing `.venv` as "python ready", and (2) the Settings "Reinstall backend" button only re-runs `uv sync` — it never re-copies the Python source. Result: shipped backend fixes (e.g. the remote-ASR model-name fix) never reach existing installs, and "reinstall" actions give users false confidence while keeping stale code.

## What Changes

- "Reinstall backend" IPC handler re-copies the bundled Python source (`setupPythonSource`) before `uv sync` and restarting, so the button actually reinstalls backend code.
- `stopPythonBackend` becomes awaitable (resolves when the process has exited); the reinstall handler waits for real process exit instead of a fixed 2-second sleep, preventing a stale process from surviving the restart.
- Version-aware refresh on launch: after a successful source copy + sync, the app writes the app version to a marker file (`~/.just-transcribe/python/.app-version`). On startup in production, if the marker is missing or differs from the running app version, the app re-copies the source and re-syncs before starting the backend.
- Dev mode is unaffected (backend runs from the repo's `python/` directory directly).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `electron-shell`: "Python environment setup" requirement gains upgrade semantics — backend source SHALL be refreshed when the app version changes and when the user triggers backend reinstall; reinstall SHALL wait for the old process to exit.

## Impact

- `electron/src/main/setup.ts`: version marker read/write helpers; marker written after successful copy + sync.
- `electron/src/main/python.ts`: `stopPythonBackend` returns a Promise resolving on process exit.
- `electron/src/main/index.ts`: `reinstall-backend` handler re-copies source and awaits stop; startup auto-start block refreshes backend when version marker is stale; `run-setup` writes the marker.
- No Python or renderer changes.

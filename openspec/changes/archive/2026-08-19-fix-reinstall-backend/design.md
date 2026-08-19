## Context

Backend code lives in `~/.just-transcribe/python/` (prod), copied from the app bundle's `Resources/python` by `setupPythonSource` (`setup.ts:208`). It runs only from the `run-setup` IPC handler during first-time setup. `checkSetupStatus` (`setup.ts:173`) reports `pythonEnvReady` purely from `.venv` existence, so subsequent launches and the `reinstall-backend` handler (`index.ts:248`) never re-copy source. `stopPythonBackend` (`python.ts:88`) is fire-and-forget (SIGTERM, force-kill after 3s) and the reinstall handler just sleeps 2s before starting a new process.

## Goals / Non-Goals

**Goals:**
- "Reinstall backend" genuinely reinstalls: fresh source copy + `uv sync` + clean restart.
- App upgrades transparently refresh the installed backend in production.
- Reinstall waits for actual process exit — no orphaned old backend.

**Non-Goals:**
- No auto-update of the Electron app itself.
- No re-download of models or re-copy of audiotee beyond existing logic.
- No dev-mode changes (dev already runs from repo source directly).
- Cutting the v0.1.5 release (separate step after this change).

## Decisions

- **Version marker file** `~/.just-transcribe/python/.app-version` containing `app.getVersion()`, written only after successful copy + `uv sync`. Chosen over comparing file mtimes/hashes: trivial, deterministic, and write-after-sync means a failed upgrade retries next launch. Marker lives inside `python/` so wiping that dir also resets it.
- **Refresh check at startup, prod only**: in the auto-start block (`index.ts:347`), if setup is ready but the marker mismatches, run `setupPythonSource` + `setupPythonEnv` + write marker before `startPythonBackend`. Dev mode skips (uses repo source).
- **`stopPythonBackend` returns `Promise<void>`** resolving on `exit` (or immediately when no process). Existing sync callers (quit path) keep working — the returned promise is ignorable. Chosen over adding a separate `stopAndWait` to keep one code path.
- **Reinstall handler order**: await stop → `setupPythonSource` → `setupPythonEnv` → write marker → start. Marker written here too so a manual reinstall also records the current version.

## Risks / Trade-offs

- [`uv sync` on every version bump adds startup latency after upgrades] → Runs only once per version change; sync on an unchanged lockfile is fast.
- [Copy failure mid-upgrade leaves mixed source] → `cpSync` with `force: true` overwrites file-by-file; marker is only written after full success, so next launch retries the whole refresh.
- [Existing broken installs (pre-marker) have no marker] → Treated as version mismatch — exactly the desired behavior: first launch of a fixed build refreshes them.

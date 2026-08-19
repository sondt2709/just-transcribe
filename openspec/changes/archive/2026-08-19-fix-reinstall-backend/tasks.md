## 1. Awaitable backend stop

- [x] 1.1 Change `stopPythonBackend` in `electron/src/main/python.ts` to return `Promise<void>` that resolves when the process exits (immediately if none running); keep SIGTERM + 3s SIGKILL escalation

## 2. Version marker helpers

- [x] 2.1 Add `readBackendVersion()` / `writeBackendVersion(version)` helpers in `electron/src/main/setup.ts` using `~/.just-transcribe/python/.app-version`, plus `backendNeedsRefresh(appVersion, isDev)` returning false in dev

## 3. Wire refresh paths in index.ts

- [x] 3.1 `reinstall-backend` handler: await `stopPythonBackend()`, then `setupPythonSource(getElectronRoot(), is.dev)`, `setupPythonEnv()`, write marker, `startPythonBackend()`
- [x] 3.2 `run-setup` handler: write marker after successful `setupPythonEnv()`
- [x] 3.3 Startup auto-start block: when `status.ready` and backend needs refresh (prod), run `setupPythonSource` + `setupPythonEnv` + write marker before `startPythonBackend()`

## 4. Verify

- [x] 4.1 Typecheck/build electron (`npm run typecheck` or `npm run build` in electron/) passes
- [x] 4.2 Dev smoke: confirm dev mode skips refresh logic (PYTHON_DIR points at repo `python/`, no marker writes into repo)

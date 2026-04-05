## 1. App Icon

- [x] 1.1 Convert `.tmp/icon.svg` to multi-size PNGs (16, 32, 64, 128, 256, 512, 1024)
- [x] 1.2 Create `.iconset` and convert to `electron/build/icon.icns` using `iconutil`

## 2. Bundle Python Source

- [x] 2.1 Add python `src/` and `pyproject.toml` to `extraResources` in `electron/package.json`, excluding `.venv`, `uv.lock`, `__pycache__`, `.omc`

## 3. Setup Screen Enhancement

- [x] 3.1 Refactor `Setup.tsx` to show stepped flow: (1) prerequisites, (2) model download, (3) run setup
- [x] 3.2 Add model download instruction (`hf download Qwen/Qwen3-ASR-1.7B`) with size info as step 2
- [x] 3.3 Only show "Run Setup" button when all prerequisites AND model are ready

## 4. Uninstall Instructions

- [x] 4.1 Add "Uninstall" section to `Settings.tsx` with three removal levels (app, data, model) and copy-pasteable commands

## 5. Build & Test

- [x] 5.1 Run `npm run build && npx electron-builder --mac` to produce DMG
- [ ] 5.2 Clean install test: delete `~/.just-transcribe` and `~/Library/Application Support/just-transcribe`, install from DMG, verify setup flow

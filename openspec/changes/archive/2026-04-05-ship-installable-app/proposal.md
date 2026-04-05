## Why

The app cannot be installed from a DMG on a fresh Mac. The python source is not bundled into `extraResources`, so the first-launch setup fails immediately. There's also no app icon, no model download guidance in the setup flow, and no uninstall instructions. This change makes Just Transcribe shippable as a self-contained DMG.

## What Changes

- Bundle python source (`src/`, `pyproject.toml`) into the DMG via `extraResources`
- Add app icon from `.tmp/icon.svg` (convert to `.icns` for macOS)
- Improve setup screen to guide users through installing prerequisites (uv, hf) AND downloading the ASR model
- Add uninstall instructions (in-app or README) so users can cleanly remove the app, data dir, and Electron storage independently

## Capabilities

### New Capabilities
- `app-packaging`: DMG build configuration — extraResources, app icon, productName, entitlements
- `setup-guide`: First-launch setup wizard — prerequisite checks, install instructions, model download guidance, progress feedback
- `uninstall`: Clean removal instructions — app bundle, `~/.just-transcribe`, `~/Library/Application Support/just-transcribe`, model cache (optional)

### Modified Capabilities
- `electron-shell`: Build config changes to bundle python source and app icon

## Impact

- `electron/package.json` — `build.mac.extraResources`, icon path
- `electron/build/` — new `icon.icns` file
- `electron/src/renderer/components/Setup.tsx` — enhanced setup instructions including model download
- `electron/src/main/setup.ts` — may need adjustments for bundled python path
- Documentation or in-app UI for uninstall steps

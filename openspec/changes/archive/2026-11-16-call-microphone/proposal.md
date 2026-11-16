## Why

Others in a call (Meet, Zoom, Teams) cannot hear the spoken translation: the app plays it only on the user's own output device, and meeting apps send only a microphone. On macOS, the only way to put audio into another app's microphone is a virtual audio device (an Audio Server Plug-in), as Teams, Zoom and Krisp do. Issue #17.

## What Changes

- New virtual input device **"Just Transcribe Microphone"**: an Audio Server Plug-in built with libASPL (MIT), shipped in the app bundle and signed ad-hoc like the app. It loops the audio that the app writes to it back to its input.
- New backend **call mic bridge**: while "Send to call" is on and the app is open, it writes the real mic (48 kHz) and the spoken translation into the device. Mode "my voice + translation" (default) or "translation only".
- The spoken translation plays on the user's output device as today, and also goes to the call while the bridge runs.
- Install, update and remove the driver from Setup (optional step) and Settings, with one admin prompt. Core Audio restarts after each, which stops all sound for about 2 seconds.
- Uninstall: a remove command in Settings, and the Homebrew cask `zap` stanza (not `uninstall`: `brew upgrade` runs it).
- The release workflow builds the driver and bundles it.

## Capabilities

### New Capabilities
- `call-microphone`: the virtual device, the call mic bridge and its modes, driver install/update/remove, and the user-facing status.

### Modified Capabilities
- `app-config`: new keys `call_mic_enabled` and `call_mic_mode`.
- `setup-guide`: optional "Call microphone" step.
- `uninstall`: command to remove the driver.
- `brew-cask`: the cask removes the driver on zap.
- `release-automation`: the release build compiles and bundles the driver.

## Impact

- New native code in `driver/` (C++17, CMake, libASPL fetched at tag `v3.1.2`).
- Backend: new `audio/call_mic.py`; `pipeline/tts.py` feeds the bridge; new endpoints `/api/callmic/*`; new config keys.
- Electron: new `main/driver.ts` (install via `osascript … with administrator privileges`); Setup, Settings and the Speak section.
- Build: `.github/workflows/release.yml`, `electron/package.json` (`extraResources`), `Casks/just-transcribe.rb` (`zap` stanza and caveats only).
- System: a file in `/Library/Audio/Plug-Ins/HAL/` and Core Audio restarts on install, update and remove.
- If macOS does not load an ad-hoc signed driver, the change stops after the spike (task 1).

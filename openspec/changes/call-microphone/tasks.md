## 1. Spike: macOS loads an ad-hoc signed driver (stop if not)

- [x] 1.1 `driver/`: loopback device "Just Transcribe Microphone" with libASPL `v3.1.2` (CMake ExternalProject), ring buffer indexed by sample time, a per-frame write stamp so unwritten frames read as silence
- [x] 1.2 `scripts/build-driver.sh`: build and ad-hoc sign into `electron/resources/driver/JustTranscribeMic.driver`
- [x] 1.3 Human installs it (one `sudo` command, Core Audio restarts); the device is listed as input and output
- [x] 1.4 Loopback check: play a tone to the output side, record the input, check the tone; check silence with no writer

## 2. Backend bridge

- [x] 2.1 Config keys `call_mic_enabled`, `call_mic_mode` with defaults and validation (+ tests)
- [x] 2.2 `audio/call_mic.py`: `CallMicBridge` with the mixer (modes, clipping), the mic ring buffer with drift handling, TTS queue at 48 kHz, start/stop, device lookup by name (+ tests with fake streams)
- [x] 2.3 `SpeechService`: push each played utterance to the bridge while it runs (+ test)
- [x] 2.4 `server.py`: create the bridge, start/stop on startup and on `PUT /api/config`, `GET /api/callmic/status` (+ API test)

## 3. Electron: install, update, remove

- [x] 3.1 `main/driver.ts`: status from `CFBundleVersion` (installed vs bundled), install/remove through one `osascript` admin prompt, Core Audio restart; IPC + preload
- [x] 3.2 Unit tests for the status comparison and the shell command builder
- [x] 3.3 Settings → Voice: driver status with Install/Update/Remove and a confirm dialog, "Send to call" switch, "Others hear" mode, the meeting-app hint
- [x] 3.4 Speak section: "Sending to call" status line; suggest `translation_only` when Speak my speech is on with `voice_and_translation`
- [x] 3.5 Setup: optional "Call microphone" step (does not block ready)
- [x] 3.6 Settings → Uninstall: the remove command

## 4. Build and release

- [x] 4.1 `electron/package.json` `extraResources`: `resources/driver` → `driver`; ignore the built driver in git
- [x] 4.2 `.github/workflows/release.yml`: run `scripts/build-driver.sh` before `electron-builder`
- [x] 4.3 `Casks/just-transcribe.rb`: `zap` stanza that deletes the driver (sudo) and restarts Core Audio when it is installed, and a caveat; no `uninstall` stanza (`brew upgrade` runs it); no change to `version`/`sha256`

## 5. Verify

- [x] 5.1 Real run, mode `translation_only`: `/api/speak` with the switch on; a separate process records "Just Transcribe Microphone"; remote ASR of the recording matches the spoken text
- [ ] 5.2 Same check from Chrome `getUserMedia` on the device
- [x] 5.3 Mode `voice_and_translation`: level check of the mic path only (room audio not kept)
- [ ] 5.4 Remove command: device no longer listed; Settings shows not installed
- [x] 5.5 Screenshots: Settings → Voice, Speak status line, Setup step

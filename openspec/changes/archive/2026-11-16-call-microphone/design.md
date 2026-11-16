## Context

The app plays the spoken translation (speak-translation) on one output device. Meeting apps send only a microphone to the call, so others never hear it. macOS has no API to inject audio into another app's input: Teams, Zoom, Krisp and Loopback each install a virtual audio device. Apple's AudioDriverKit needs entitlements granted by Apple and a paid Developer ID; the app ships unsigned (ad-hoc) through a Homebrew cask. An Audio Server Plug-in (`.driver` bundle in `/Library/Audio/Plug-Ins/HAL`, loaded by `coreaudiod`) has no such requirement, as long as macOS loads an ad-hoc signed bundle.

## Goals / Non-Goals

**Goals:**
- A virtual input device "Just Transcribe Microphone" that any meeting app can select.
- The app writes the real mic and the spoken translation into it, or the translation only.
- Install, update and remove from the app with one admin prompt each; remove from the Homebrew cask.
- Built and bundled by the release workflow.

**Non-Goals:**
- Hiding the device from the system output list, per-app routing, or auto-switching the meeting app's mic.
- Noise suppression or echo cancellation on the passed-through mic (meeting apps do that).
- Running the bridge when the app is closed.
- Developer ID signing and notarization.

## Decisions

1. **Audio Server Plug-in with libASPL (MIT, tag `v3.1.2`)**, not AudioDriverKit (needs Apple entitlements), not BlackHole (GPL-3, generic name, separate install), not Apple's NullAudio sample alone (more boilerplate; libASPL wraps it).
2. **One loopback device with an input stream and an output stream** (2 channels, float32, 48 kHz). The backend writes to the output side with the same `sounddevice` path that TTS playback already uses. The driver keeps a ring buffer indexed by sample time (like BlackHole): `OnWriteMixedOutput` writes at the output sample time and stamps each slot with that sample time; `OnReadClientInput` reads at the input sample time and returns silence for a slot whose stamp differs. A stopped writer gives silence, not a repeated loop, and several clients can read the same frames. Alternative considered: an input-only device fed by shared memory from the backend — no output entry in system lists, but needs a mach service, custom IPC and more native code. Rejected for v1.
3. **The device cannot become the system sound-effects output** (`CanBeDefaultForSystemSounds = false`). libASPL's `CanBeDefault` has no scope, so it stays true: the device can be the default input (for apps that follow the system mic), and its output side is listed in the Sound output list too.
4. **Backend `CallMicBridge`** (`audio/call_mic.py`): runs while `call_mic_enabled` is true and the backend runs, independent of recording.
   - Opens the real mic (default input) at 48 kHz in its own `sounddevice.InputStream`, separate from the 16 kHz ASR capture. Alternative: one 48 kHz capture shared with ASR — rejected, it touches the tested capture path.
   - An `OutputStream` to "Just Transcribe Microphone" at 48 kHz with low latency. Its callback mixes: mic frames from a ring buffer (mode `voice_and_translation`) plus TTS frames from a queue, clipped to [-1, 1].
   - Clock drift between the real mic and the virtual device: the mic ring buffer targets 20–60 ms of fill; when it exceeds the upper bound the callback drops frames, when it underruns it pads with zeros. Simple and inaudible at speech level.
   - Mode `translation_only` ignores the mic frames but keeps the mic stream closed (no mic indicator).
5. **TTS goes to both outputs.** `SpeechService` keeps its player for the user's output device and, when the bridge runs, also pushes the same samples (resampled to 48 kHz) to the bridge. Playback state and the mic gate stay driven by the main player.
6. **Install from Electron main** (`main/driver.ts`): one `osascript -e 'do shell script "…" with administrator privileges'` that copies the bundled `JustTranscribeMic.driver` into `/Library/Audio/Plug-Ins/HAL/`, sets `root:wheel`, and restarts Core Audio (`killall coreaudiod`; launchd restarts it). Remove deletes the bundle and restarts Core Audio. Status reads `CFBundleVersion` from the installed and the bundled `Info.plist`: `not_installed`, `installed`, `update_available`.
7. **PortAudio reload:** reloading (to see a device added after startup) closes every open stream. `audio/portaudio.py` is the one reload for the backend: the bridge registers there, closes its streams before a reload and reopens them after the caller (the ASR mic) has opened its stream. Order matters: a mic stream opened later with another buffer size stops an earlier one on the same device (AUHAL error -50, found in the real-app check: starting a recording stopped both the ASR mic and the bridge mic). The bridge itself reloads only when no ASR mic stream and no playback is open. A watchdog reopens the bridge streams when their callbacks stop for 2 s (Core Audio restarted).
8. **Build:** `driver/CMakeLists.txt` uses `ExternalProject` for libASPL at the pinned tag; `scripts/build-driver.sh` builds and ad-hoc signs (`codesign --force -s -`) into `electron/resources/driver/`. The release workflow runs the script before `electron-builder`; `extraResources` bundles the result.

## Risks / Trade-offs

- [macOS 26 refuses an ad-hoc signed HAL plug-in] → Task 1 is a spike before any other work; stop and report if the device does not appear.
- [Core Audio restart drops all sound for about 2 s, including a live call] → The UI says so before each install/update/remove and asks for confirmation; never automatic.
- [The app quits or crashes while a meeting uses the device → the call hears silence] → The Speak section and Settings say so; the user switches the meeting mic back. The backend restarts on crash as today.
- [Mic indicator stays on while "Send to call" is on in mode `voice_and_translation`] → Expected: the mic is live for the call. Turned off with the switch.
- [PortAudio `-9986` reload cannot run while the bridge holds streams] → The player error message says to toggle "Send to call" or restart recording; the bridge restarts its streams on error.
- [Added latency on the passed-through voice, about 30–60 ms] → Low-latency streams; acceptable for speech.
- [Double voice in mode `voice_and_translation` with Speak my speech] → The UI suggests `translation_only` when Speak my speech is on.

## Migration Plan

- New install: optional Setup step. Existing users: Settings → Voice → "Call microphone" → Install.
- Driver updates: the app shows "Update" when the bundled version differs; never updates silently.
- Rollback: turn off "Send to call" and run the remove command (Settings → Uninstall), or `brew uninstall --zap just-transcribe`. Old app versions ignore the new config keys.
- The cask removes the driver in `zap`, not `uninstall`: `brew upgrade` runs the old version's `uninstall` stanza (Homebrew skips only `signal` on upgrade), so an `uninstall` entry would remove the driver and stop all sound on every upgrade.

## Open Questions

- None. (Resolved: libASPL's `CanBeDefault` has no scope; see decision 3.)

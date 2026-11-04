## Context

- `sounddevice` calls `Pa_Initialize` one time, at import. PortAudio keeps the device list from that call.
- On macOS, CoreAudio gives new device IDs when a device is removed and added again. The old list then points to devices that do not exist.
- The backend runs for the full life of the app. One meeting can be longer than one hour.
- The mic is the only PortAudio stream in the backend. The speaker uses the `audiotee` subprocess. `/api/devices` calls `sd.query_devices()` and opens no stream.

## Goals / Non-Goals

**Goals:**
- Start works after the audio devices change while the backend runs, with no app restart.

**Non-Goals:**
- Detect or recover a mic stream that goes silent during a recording. A separate change will do this.
- Refresh the list that `/api/devices` returns.

## Decisions

1. **Reload PortAudio in `MicCapture.start`, before each open.** Call `sd._terminate()` and then `sd._initialize()`.
   - Alternative: reload only after `sd.PortAudioError`, then retry. This adds a retry path and opens a stale default device that works but is wrong (for example, the old headset ID now points to a different device).
   - Alternative: restart the Python backend from Electron. This is slower and loses the loaded model.
   - Reload costs a few milliseconds. Start happens one time per recording.
2. **Reload only when no mic stream is open.** `Pa_Terminate` closes all open streams. Each Start makes a new `MicCapture`, so `self._stream` is `None` in `start()`. The code checks this before the reload.
3. **Use the private functions `sd._terminate` and `sd._initialize`.** `sounddevice` has no public reload function. The `sounddevice` maintainers recommend these functions for this problem.

## Risks / Trade-offs

- [A new `sounddevice` version removes or renames the private functions] → If the reload raises `AttributeError`, log a warning and open the stream with the old list. The pinned `sounddevice>=0.5.3` has both functions.
- [`_terminate` fails because PortAudio is not initialized] → Catch `sd.PortAudioError` from `_terminate` and still call `_initialize`.

## Migration Plan

No migration. Rollback: revert the commit.

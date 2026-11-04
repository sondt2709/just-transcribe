## Why

PortAudio reads the audio device list one time per process. When the devices change while the backend runs (for example, a Bluetooth headset reconnects), the next Start fails with `Error opening InputStream: Internal PortAudio error [PaErrorCode -9986]`. The user cannot record again until they quit and open the app again.

## What Changes

- `MicCapture.start` reloads PortAudio before it opens the `sd.InputStream`. The stream then uses the current device list and the current default input.
- Add a `test` dependency group with pytest and the first backend unit test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audio-capture`: the "Microphone audio capture" requirement adds a scenario: Start works after the audio devices change while the backend runs.

## Impact

- Code: `python/src/just_transcribe/audio/mic.py`.
- Tests: new `python/tests/test_mic.py`.
- Dependencies: `pytest` in a `test` dependency group in `python/pyproject.toml`. `uv sync` does not install this group, so user machines do not get pytest.
- API: no change to `/api/start`.

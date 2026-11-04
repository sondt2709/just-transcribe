## 1. Failing test

- [x] 1.1 Add a `test` dependency group with `pytest` (not `dev`: `uv sync` in `setup.ts` installs `dev` on user machines) to `python/pyproject.toml`
- [x] 1.2 Add `python/tests/test_mic.py`: `MicCapture.start` reloads PortAudio before it opens `sd.InputStream`
- [x] 1.3 Run the test on the base code and keep the failure output

## 2. Fix

- [x] 2.1 Reload PortAudio in `MicCapture.start` when no mic stream is open
- [x] 2.2 Log a warning and continue if the reload functions are missing
- [x] 2.3 Run the unit tests and see them pass

## 3. Real-device check

- [ ] 3.1 On the base code: start, stop, reconnect the headset, start → expect `PaErrorCode -9986`
- [ ] 3.2 On the fix: same steps → expect `recording`, `mic_active: true`, and `chunks_mic > 0` in `events.jsonl`

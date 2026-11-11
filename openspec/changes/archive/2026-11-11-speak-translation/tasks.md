## 1. Config

- [x] 1.1 Add the `tts_*` keys to `AppConfig` (`to_dict`, `from_dict`, defaults, engine value check)
- [x] 1.2 Test: old config without `tts_*` keys loads with `tts_engine = "system"` and round-trips

## 2. Speech service (Python)

- [x] 2.1 Create `pipeline/tts.py`: engine selection with fallback (Qwen language map), `system` engine (`say` to WAV, voice list from `say -v '?'` with locale match), `qwen_local` engine (lazy load, lock, `generate`), `qwen_remote` engine (`/v1/audio/speech`, WAV)
- [x] 2.2 Add `SpeechService`: FIFO queue worker, statuses and `speak` events, translate step, playback through `sounddevice.OutputStream` on the named device (default fallback), Stop, Replay cache of 20, `playback_active()` with a 0.8 s release
- [x] 2.3 Add model status and background download (`snapshot_download`, cache size progress)
- [x] 2.4 Add `TranslationService.translate_once(text, target_lang, source_lang="")`
- [x] 2.5 Tests: engine choice and fallback, voice-by-locale, queue order and no overlap, Stop drops queued, Replay without synthesis, translate on/off, LLM not configured, model not downloaded, device fallback, release window

## 3. Capture and backend API

- [x] 3.1 Add `--exclude-processes <os.getpid()>` to the audiotee command in `audio/speaker.py`; test the args
- [x] 3.2 Gate mic segments and interims in `orchestrator.py` while `playback_active()`; trace reason `tts_playback`; test
- [x] 3.3 Create `SpeechService` in the lifespan; reconfigure it in `PUT /api/config`; warm up the Qwen model when its engine is selected
- [x] 3.4 Add `/api/speak`, `/api/speak/stop`, `/api/speak/replay`, `/api/tts/status`, `/api/tts/voices`, `/api/tts/devices`, `/api/tts/download`
- [x] 3.5 Speak my speech: in `_on_segment`, enqueue final `You` segments when `tts_speak_mic` is on
- [x] 3.6 Test the endpoints and the Speak my speech hook with fake engines

- [x] 3.7 `save_config` merges the backend keys into the existing file, so the Electron keys survive a backend save (the Speak tab saves on each toggle); test

- [x] 3.8 On a PortAudio error when the output opens, reload PortAudio and retry once if no mic stream is open; test

- [x] 3.9 Gate mic segments by their time span against recorded playback intervals (a real run leaked one echo line with the "now" check); regression test

- [x] 3.10 Do not cache a failed macOS voice list; test

## 4. UI (Electron)

- [x] 4.1 Handle `speak` events in `useTranscript.ts` (utterance list by id)
- [x] 4.2 Create `AiPanel.tsx` with tabs Summary | Speak; create `SpeakPanel.tsx` (target, engine line, text box with ⌘↩, Translate first, Speak my speech, Now playing + Stop, history with Replay/Copy)
- [x] 4.3 Add speak buttons to `You` lines in `Transcript.tsx` and to suggested answers in `SummaryPanel.tsx`
- [x] 4.4 Add the "Voice (TTS)" section in `Settings.tsx` (engine, voice, target, device, fallback, download with progress, remote URL/key/model with Test); add the Uninstall line for the TTS model
- [x] 4.6 Speak tab refreshes engine/voice when shown and after each finished line; shows "…" while the status loads
- [x] 4.5 Add the optional Qwen3-TTS step to `Setup.tsx` and `ttsModelDownloaded` to `main/setup.ts` (does not change `ready`)

## 5. Verify

- [x] 5.1 `cd python && uv run --group test pytest` and `cd electron && npm test && npm run build` pass; break the code once for each new test group
- [x] 5.2 Round trip: speak an English and a Vietnamese text through `/api/speak` with each engine; capture the played audio with a separate audiotee tap; transcribe it with the remote ASR; compare the text
- [x] 5.3 Self-capture: record with mic and speaker capture on while the app speaks; `/api/transcript` has no spoken sentence; a control sentence from another process is captured; `mic_gated` reason `tts_playback` in the trace
- [x] 5.4 Remote engine: run `mlx_audio.server` on localhost; speak with `qwen_remote`; the server logs `POST /v1/audio/speech 200`
- [x] 5.5 Screenshot of the Speak tab (the Settings "Voice" section and the hover speak buttons were not captured: UI automation could not open Settings)

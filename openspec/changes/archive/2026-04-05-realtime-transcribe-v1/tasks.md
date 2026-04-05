## 1. Project Scaffolding

- [x] 1.1 Initialize Python package at `python/` with `pyproject.toml` (name: just-transcribe, dependencies: mlx-qwen3-asr, mlx-audio, sounddevice, fastapi, uvicorn, websockets, numpy, tomli, tomli-w)
- [x] 1.2 Create `python/src/just_transcribe/` package with `__init__.py`, `__main__.py`, `config.py`
- [x] 1.3 Scaffold Electron app at `electron/` using electron-vite with React + TypeScript template
- [x] 1.4 Copy pre-built audiotee binary to `electron/resources/bin/audiotee`
- [x] 1.5 Create `~/.just-transcribe/` directory structure constants in `config.py` (bin/, python/, logs/, config.toml paths)

## 2. Python Audio Capture

- [x] 2.1 Implement `audio/mic.py` — sounddevice InputStream wrapper at 16kHz mono float32 with callback pushing to asyncio queue, source-tagged as "mic"
- [x] 2.2 Implement `audio/speaker.py` — audiotee subprocess manager: spawn with `--sample-rate 16000`, read stdout in thread, push float32 chunks to asyncio queue, source-tagged as "speaker". Handle process exit and missing binary errors
- [x] 2.3 Implement `audio/stream.py` — unified audio stream manager that starts/stops mic and speaker capture, exposes a single async generator yielding source-tagged audio chunks

## 3. Transcription Pipeline

- [x] 3.1 Implement `pipeline/vad.py` — Silero VAD wrapper: load model, process 16kHz audio chunks, detect speech segments with threshold 0.5, min speech 250ms, min silence 2.0s, return finalized speech segments with source tag
- [x] 3.2 Implement `pipeline/asr.py` — single mlx-qwen3-asr Session wrapper: load Qwen3-ASR 1.7B model, accept speech segments from VAD, call `feed_audio()` / `transcribe()`, return segments with text, timestamps, detected language, source, and speaker label ("You" for mic, "Others" for speaker)
- [x] 3.3 Implement `pipeline/orchestrator.py` — pipeline orchestrator: consume audio chunks from stream manager, run VAD on each stream independently, queue finalized speech segments, feed to ASR sequentially, emit segment events. Wire VAD → ASR → output as async pipeline

## 4. Translation

- [x] 4.1 Implement `pipeline/translate.py` — async translation service: accept segment + preferred language, skip if language matches, call OpenAI-compatible `/v1/chat/completions` with segment text + up to 3 prior segments as context, return translated text. Handle API errors gracefully without blocking pipeline

## 5. Backend Server

- [x] 5.1 Implement `server.py` — FastAPI app with: POST `/api/start` (start capture + pipeline), POST `/api/stop` (stop all), GET `/api/status` (state, model loaded, active streams), GET `/api/devices` (list microphones via sounddevice)
- [x] 5.2 Add WebSocket endpoint `/ws/transcript` — broadcast segment, interim, translate, and error events to connected clients as JSON
- [x] 5.3 Implement `__main__.py` — CLI entry point: parse `--port` arg, configure logging to `~/.just-transcribe/logs/backend.log` with 10MB rotation, start uvicorn, spawn stdin EOF watcher thread for parent death detection, register SIGTERM handler for graceful shutdown

## 6. App Configuration

- [x] 6.1 Implement `config.py` — app directory paths (`~/.just-transcribe/`), load/save `config.toml` (preferred_language, llm_api_base, llm_model, llm_api_key, mic_enabled, speaker_enabled), defaults, ensure directory structure exists on startup
- [x] 6.2 Add config API endpoints — GET `/api/config` (read current config), PUT `/api/config` (update and persist to config.toml)

## 7. Electron Main Process

- [x] 7.1 Implement `main/python.ts` — Python sidecar manager: find random free port, spawn `uv run python -m just_transcribe --port PORT` with cwd `~/.just-transcribe/python/`, pipe stdin, handle stdout for ready signal, kill on app quit, restart on crash with user notification
- [x] 7.2 Implement `main/setup.ts` — first-launch setup: check `uv` and `hf` in PATH, check `~/.just-transcribe/` exists, copy Python source + audiotee binary if needed, run `uv sync`, check model cache in `~/.cache/huggingface/`, report status to renderer via IPC
- [x] 7.3 Wire app lifecycle in `main/index.ts` — on ready: run setup checks → spawn Python → open window. On will-quit: kill Python. On window-all-closed: quit app. Pass backend port to renderer via IPC

## 8. Electron Renderer UI

- [x] 8.1 Set up UI foundation — install shadcn/ui (or similar modern component library), configure Tailwind CSS, create app layout with header bar (app title, recording indicator) and main content area
- [x] 8.2 Implement `hooks/useTranscript.ts` — WebSocket hook: connect to `ws://localhost:PORT/ws/transcript`, parse events, maintain segments array with interim updates, handle translate events by merging into existing segments, auto-reconnect on disconnect
- [x] 8.3 Implement `hooks/useBackend.ts` — HTTP hook: backend status polling, start/stop recording via POST, fetch devices list, manage connection state
- [x] 8.4 Implement `components/Transcript.tsx` — scrollable transcript view with dashboard layout (main transcript + sidebar controls). Each segment shows speaker label badge ("You" in blue, "Others" in gray), text, language badge, timestamp. Translations displayed prominently alongside original text (indented, distinct background, same font size — not muted/secondary). Interim text shown with typing indicator style. Auto-scroll to bottom on new segments
- [x] 8.5 Implement `components/Controls.tsx` — recording control bar: start/stop button with recording state indicator, audio source toggles (mic, speaker), status display (connected/disconnected, model loaded)
- [x] 8.6 Implement `components/Settings.tsx` — settings panel/dialog: preferred language selector, LLM API configuration (base URL, model, API key), save to backend via PUT `/api/config`
- [x] 8.7 Implement `components/Setup.tsx` — first-launch setup wizard: prerequisite check status, Python environment setup progress, model download progress with size/ETA, permission grant instructions. Shown only when setup is incomplete

## 9. Integration & Packaging

- [ ] 9.1 End-to-end integration test — launch Python backend manually via `uv run`, verify mic capture → VAD → ASR → WebSocket output works from terminal
- [ ] 9.2 Wire Electron + Python together — verify Electron spawns Python, connects WebSocket, displays transcript, kills Python on quit
- [x] 9.3 Configure electron-builder for macOS — set `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription` in Info.plist, bundle audiotee binary in resources, configure DMG output
- [ ] 9.4 Test first-launch flow — verify prerequisite checks, Python setup, model download prompts, and permission dialogs work end-to-end

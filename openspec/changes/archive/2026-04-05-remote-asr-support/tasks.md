## 1. ASR Provider Abstraction (Python Backend)

- [x] 1.1 Define `ASRProvider` protocol in `asr.py` with methods: `transcribe_segment(audio, language)`, `set_language(language)`, `is_loaded()`
- [x] 1.2 Refactor existing `ASREngine` to satisfy `ASRProvider` protocol (rename internal references, keep all existing behavior)
- [x] 1.3 Update `PipelineOrchestrator` to accept `ASRProvider` instead of `ASREngine` (type hint change, no logic change)

## 2. Remote ASR Engine (Python Backend)

- [x] 2.1 Create `asr_remote.py` with `RemoteASREngine` class implementing `ASRProvider` protocol
- [x] 2.2 Implement `transcribe_segment()` — encode float32 audio to WAV in-memory via soundfile, POST to `/v1/audio/transcriptions` as multipart form
- [x] 2.3 Implement retry logic: 1 retry on 429/500/502/503/timeout, exponential backoff (1s base), no retry on 400/404
- [x] 2.4 Implement `test_connection(url, api_key)` — GET `{url}/v1/models`, return ok/error/models list
- [x] 2.5 Implement `list_models(url, api_key)` — parse OpenAI-format model list response
- [x] 2.6 `is_loaded()` always returns True, `set_language()` stores hint for next request

## 3. Configuration (Python Backend)

- [x] 3.1 Add `asr_provider` ("local"/"remote"), `asr_base_url`, `asr_api_key` fields to `AppConfig` in `config.py` with defaults
- [x] 3.2 Add provider factory function: given config, return `LocalASREngine` or `RemoteASREngine`
- [x] 3.3 Update `server.py` lifespan to use provider factory instead of hardcoded `ASREngine`
- [x] 3.4 Skip local model loading when `asr_provider = "remote"` (no MLX import, no GPU memory)

## 4. Server Endpoints (Python Backend)

- [x] 4.1 Add `POST /api/asr/test` endpoint — accepts `{url, api_key?}`, returns `{ok, models?, error?}`
- [x] 4.2 Add `GET /api/asr/models` endpoint — queries configured remote server, returns `{models[]}`
- [x] 4.3 Update `PUT /api/config` to validate provider switch: reject while recording, test remote connection on switch to remote, check model cache on switch to local
- [x] 4.4 Re-initialize ASR provider on config change (unload local model when switching to remote, load when switching to local)

## 5. Settings UI (Electron Renderer)

- [x] 5.1 Update config TypeScript interface with `asr_provider`, `asr_base_url`, `asr_api_key` fields
- [x] 5.2 Add ASR provider toggle (Local/Remote) to Settings modal, disabled while recording
- [x] 5.3 Add conditional remote config section: Server URL input, API Key input, Test button with status indicator
- [x] 5.4 Add model dropdown populated from `POST /api/asr/test` or `GET /api/asr/models` response, default to first model
- [x] 5.5 Validate on Save: for remote, test connection and verify model selection before saving; for local, verify model exists
- [x] 5.6 Show error messages when validation fails (unreachable server, missing local model)

## 6. Setup Flow (Electron Renderer)

- [x] 6.1 Add provider choice as first setup step with "Local (on-device)" and "Remote Server" cards
- [x] 6.2 Remote path: skip hf CLI check and model download steps, show only uv + Python env + audiotee
- [x] 6.3 Remote path: add server URL + Test + model selection step before "Run Setup"
- [x] 6.4 Local path: keep existing flow, accept model from any install method (check cache dir existence only)
- [x] 6.5 Save chosen provider to config.toml before running Python env setup

## 7. Integration & Verification

- [x] 7.1 End-to-end test: local provider — existing behavior unchanged, transcription works
- [x] 7.2 End-to-end test: remote provider — configure remote URL, verify transcription via HTTP
- [x] 7.3 Test provider switching: local->remote and remote->local while not recording
- [x] 7.4 Test guard: provider switch rejected while recording is active
- [x] 7.5 Test setup flow: remote path skips model download, local path requires it

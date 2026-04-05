## Why

The app currently only supports local ASR via mlx-qwen3-asr on Apple Silicon. Users with access to a GPU server (or cloud ASR endpoint) cannot offload transcription, forcing them to download a ~3.5GB model and consume local GPU resources. Adding remote ASR support lets users point to an OpenAI-compatible ASR server, skip local model setup entirely, and leverage more powerful hardware for better throughput.

## What Changes

- Add ASR provider abstraction (local vs remote) so the pipeline can use either backend transparently
- Add remote ASR engine that sends audio to an OpenAI-compatible `/v1/audio/transcriptions` endpoint via multipart WAV upload
- Add new API endpoints for testing remote connections and discovering available models
- Update Settings UI with provider toggle (local/remote), remote server configuration (URL, model dropdown, API key), and connection status indicator
- Update Setup flow to offer provider choice upfront — remote users skip `hf` CLI install and model download entirely
- Validate provider readiness on switch: remote verifies connection + model availability; local verifies model exists in HuggingFace cache
- Disable provider switching while recording is active

## Capabilities

### New Capabilities
- `remote-asr`: Remote ASR engine that transcribes audio via HTTP to an OpenAI-compatible server, with connection testing, model discovery, and retry logic

### Modified Capabilities
- `transcription-pipeline`: ASR engine is now pluggable (local or remote) rather than hardcoded to mlx-qwen3-asr. Pipeline uses a provider protocol instead of concrete class.
- `app-config`: New config fields for ASR provider selection (`asr_provider`, `asr_base_url`, `asr_api_key`). Model field becomes provider-aware.
- `setup-guide`: Setup flow adds provider choice step. Remote users skip hf CLI and model download prerequisites. Local users keep existing flow. hf is preferred for model install but any method that places model in correct cache folder is accepted.
- `backend-server`: New endpoints for remote ASR connection testing (`POST /api/asr/test`) and model listing (`GET /api/asr/models`).

## Impact

- **Python backend**: New `asr_remote.py` module. Changes to `asr.py` (extract protocol), `config.py` (new fields), `server.py` (provider factory + new endpoints), `orchestrator.py` (type hint only).
- **Electron renderer**: Changes to `Settings.tsx` (provider toggle + remote config), `Setup.tsx` (provider choice step), config TypeScript interface.
- **Dependencies**: Add `soundfile` for in-memory WAV encoding (may already be transitive). `httpx` already available.
- **No breaking changes**: Default remains `asr_provider = "local"`, existing users unaffected.

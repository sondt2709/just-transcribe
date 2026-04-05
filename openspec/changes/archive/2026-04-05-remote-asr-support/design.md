## Context

The app currently hardcodes `mlx-qwen3-asr` as the sole ASR backend. The `ASREngine` class directly imports and instantiates an MLX session, and the pipeline orchestrator is tightly coupled to this concrete class. Users must download the model locally and run inference on Apple Silicon GPU.

The meeting-companion project already implements remote ASR via an OpenAI-compatible HTTP API (`POST /v1/audio/transcriptions`), proving the API contract works with Qwen3-ASR models served by vLLM or similar inference servers.

## Goals / Non-Goals

**Goals:**
- Users can choose between local (MLX) and remote (HTTP) ASR at setup time and in settings
- Remote users skip model download and hf CLI installation entirely
- Switching providers validates readiness (connection test for remote, model existence for local)
- Pipeline code is unaware of which provider is active — clean abstraction
- Interim (partial) transcription works with both providers

**Non-Goals:**
- Streaming WebSocket ASR protocol (we use the same batch-per-segment HTTP approach for remote)
- Supporting non-OpenAI-compatible ASR APIs
- Auto-fallback from remote to local on failure (user explicitly chooses)
- Multiple simultaneous ASR providers

## Decisions

### Decision 1: ASR Provider Protocol

Introduce a Python `Protocol` class that both local and remote engines implement:

```python
class ASRProvider(Protocol):
    async def transcribe_segment(self, audio: np.ndarray, language: str) -> TranscriptSegment: ...
    def set_language(self, language: str) -> None: ...
    def is_loaded(self) -> bool: ...
```

The orchestrator receives an `ASRProvider` instead of `ASREngine`. The `_asr_lock` stays in the orchestrator (serializes access regardless of provider).

**Why protocol over ABC**: No forced inheritance. Existing `ASREngine` satisfies the protocol with minimal changes. Remote engine is a separate module with no shared state.

**Alternative considered**: Strategy pattern with a factory class. Rejected — over-engineered for two providers. Protocol is simpler and Pythonic.

### Decision 2: Audio encoding for remote

Encode `float32` numpy arrays to WAV in-memory using `soundfile` + `io.BytesIO`, then send as multipart form upload. The OpenAI-compatible API expects file upload with `content-type: audio/wav`.

```python
buf = io.BytesIO()
sf.write(buf, audio, 16000, format="WAV", subtype="PCM_16")
buf.seek(0)
# POST as files={"file": ("segment.wav", buf, "audio/wav")}
```

**Why WAV over raw PCM**: Universal support across ASR servers. The OpenAI API spec requires file upload, not raw binary. WAV header overhead is 44 bytes — negligible.

**Why PCM_16 subtype**: Halves the payload vs float32 WAV. 16-bit PCM is the standard for speech. A 15-second segment at 16kHz = ~480KB (acceptable for LAN).

### Decision 3: Model discovery via /v1/models

The remote engine queries `GET {base_url}/v1/models` to discover available models. The UI presents these in a dropdown, selecting the first by default.

Response format (OpenAI-compatible):
```json
{"data": [{"id": "Qwen/Qwen3-ASR-1.7B"}, {"id": "Qwen/Qwen3-ASR-0.6B"}]}
```

If the endpoint is unavailable or returns an error, the UI shows an error state and prevents saving.

**Alternative considered**: Hardcoded model list. Rejected — breaks when servers host different models or custom fine-tunes.

### Decision 4: Connection validation on save

When the user configures remote ASR and clicks Save:
1. `POST /api/asr/test` with `{url, api_key}` — backend pings `GET {url}/v1/models`
2. On success: returns `{ok: true, models: [...]}` — UI populates model dropdown
3. On failure: returns `{ok: false, error: "..."}` — UI shows error, blocks save

For local: backend checks if model directory exists in `~/.cache/huggingface/hub/`. No network call needed.

This runs only on explicit user action (Save/Test), not continuous polling.

### Decision 5: Setup flow branching

The setup wizard adds a provider choice as the first step:

- **Remote path**: Skip hf CLI check, skip model download. Only need `uv` + Python env + `audiotee`. After entering server URL, validate connection before proceeding.
- **Local path**: Existing flow unchanged. hf CLI is the preferred way to download the model, but setup only checks if the model directory exists in HuggingFace cache — users can place it there by any means.

The choice is saved to `config.toml` as `asr_provider = "local" | "remote"`.

### Decision 6: Provider switching constraints

- Provider toggle is **disabled while recording**. User must stop recording first.
- Switching to remote: requires valid URL + successful connection test + model selection.
- Switching to local: requires model exists in HuggingFace cache. If not, show guidance to download.
- On switch, the server re-initializes the ASR provider (unloads local model if switching to remote, loads it if switching to local).

### Decision 7: Remote engine retry and timeout

- HTTP timeout: 30s per request (speech segments are max 15s audio, inference should be fast)
- Retry: 1 retry on 429/500/502/503, exponential backoff (1s base)
- No retry on 400/404 (client error, won't help)
- Connection errors surface as WebSocket error events to the UI

## Risks / Trade-offs

- **[Latency]** Remote interim transcription adds network round-trip every 0.5s. On LAN (~10ms) this is fine. Over WAN (~100-300ms) it may feel sluggish. → Mitigation: acceptable for v1; can add configurable interim interval later.

- **[Payload size]** WAV encoding adds overhead vs streaming raw audio. A 15s segment = ~480KB. → Mitigation: PCM_16 keeps it reasonable. LAN bandwidth is not a bottleneck.

- **[Server availability]** Remote server going down during recording causes transcription failures. → Mitigation: Errors surface via WebSocket error events. User can switch to local in settings (after stopping recording).

- **[Model mismatch]** User could select a non-ASR model from `/v1/models` (e.g., an LLM). → Mitigation: No filtering in v1 — user is expected to know their server. Could add model validation later.

- **[MLX memory]** Switching from remote to local requires loading ~3GB model into GPU memory. → Mitigation: This already happens at startup. Same code path, just triggered on config change instead.

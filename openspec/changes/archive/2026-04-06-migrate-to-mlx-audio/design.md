## Context

The app currently uses `mlx-qwen3-asr` to run Qwen3-ASR-1.7B at full precision on Apple Silicon. This causes excessive thermal output. The library lacks quantization support, so it cannot load 8bit/4bit MLX community models. `mlx-audio` is an actively maintained library that supports 17+ ASR models including quantized variants, with a clean `load()` + `generate()` API.

Feasibility testing confirmed:
- `mlx-audio` loads `Qwen3-ASR-1.7B-8bit` successfully
- The `ASREngine` wrapper works as a drop-in behind the existing `ASRProvider` protocol
- Venv grows from 659MB → 1.1GB (acceptable for an Electron desktop app already shipping PyTorch)

## Goals / Non-Goals

**Goals:**
- Replace `mlx-qwen3-asr` with `mlx-audio[stt]` as the local ASR backend
- Default to the quantized `mlx-community/Qwen3-ASR-1.7B-8bit` model
- Reduce laptop thermal load during transcription
- Maintain identical `ASRProvider` protocol — no changes to orchestrator, remote ASR, or frontend

**Non-Goals:**
- Exposing mlx-audio's multi-model support in the UI (future work)
- Adding mlx-audio's streaming API (`stream_transcribe`) — current chunk-based pipeline is sufficient
- Removing PyTorch dependency (still needed for Silero VAD)

## Decisions

### 1. Replace mlx-qwen3-asr entirely (not dual-support)

**Choice**: Remove `mlx-qwen3-asr`, add `mlx-audio[stt]` as sole local ASR backend.

**Alternatives considered**:
- Keep both libraries, let user choose → Double maintenance, no user benefit since mlx-audio is strictly more capable
- Only use mlx-audio for quantized models → Confusing config, two code paths for same function

**Rationale**: mlx-audio is a superset. It loads the same models plus quantized ones. One code path is simpler.

### 2. Default model: `mlx-community/Qwen3-ASR-1.7B-8bit`

**Choice**: Change `DEFAULT_ASR_MODEL` to the 8bit quantized variant.

**Rationale**: Solves the core problem (heat). 8bit quantization has negligible quality loss for ASR. Users can still configure any mlx-audio-compatible model via `asr_model` in config.

### 3. Handle old config values gracefully

**Choice**: If `asr_model` in user's `config.toml` is `Qwen/Qwen3-ASR-1.7B` (the old default), silently map it to `mlx-community/Qwen3-ASR-1.7B-8bit` with a log warning.

**Rationale**: Prevents breakage for existing users on upgrade. The old HF repo ID won't work with mlx-audio anyway.

### 4. API adaptation in ASREngine

Key differences to handle:
- **Audio input**: mlx-audio expects `numpy array` directly; old API expected `(array, sample_rate)` tuple
- **Language return**: mlx-audio returns `list`; normalize to `str`
- **Import path**: `mlx_audio.stt.load` replaces `mlx_qwen3_asr.session.Session`

## Risks / Trade-offs

- **[Venv size +441MB]** → Acceptable for desktop Electron app. Mostly `transformers` + `scikit-learn` pulled transitively. Could investigate trimming unused transitive deps later.
- **[First-launch model download]** → Users upgrading will need to download the 8bit model (~1GB). Mitigated by existing HF cache — if they had the full model, the 8bit is a separate download but fast.
- **[mlx-audio upstream breaking changes]** → Pin to `>=0.4.0` with upper bound if needed. The `load()` + `generate()` API is stable across the 17 model implementations.
- **[Old config.toml incompatibility]** → Handled by migration mapping in Decision #3.

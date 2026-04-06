## Why

The current local ASR backend (`mlx-qwen3-asr`) only supports full-precision Qwen3 models. Running `Qwen/Qwen3-ASR-1.7B` at full precision causes excessive heat and power consumption on MacBook hardware. The library cannot load quantized models (8bit/4bit) because it lacks quantization parameter support (scales/biases), confirmed by a 297-parameter `ValueError`. Switching to `mlx-audio` enables quantized model support, reducing thermal load while maintaining transcription quality.

## What Changes

- **BREAKING**: Replace `mlx-qwen3-asr` dependency with `mlx-audio[stt]` in `pyproject.toml`
- Change default ASR model from `Qwen/Qwen3-ASR-1.7B` to `mlx-community/Qwen3-ASR-1.7B-8bit`
- Rewrite `ASREngine` in `pipeline/asr.py` to use `mlx_audio.stt.load` API instead of `mlx_qwen3_asr.session.Session`
- Handle mlx-audio's different return types (language as list, audio input as numpy array directly)

## Capabilities

### New Capabilities

_(none — this is a backend swap, not a new capability)_

### Modified Capabilities

- `transcription-pipeline`: The ASR engine implementation changes from `mlx-qwen3-asr` to `mlx-audio`. The `ASRProvider` protocol is unchanged, but the concrete `ASREngine` class uses a different underlying library and API. Default model changes to a quantized variant.

## Impact

- **Dependencies**: Remove `mlx-qwen3-asr>=0.3.2`, add `mlx-audio[stt]>=0.4.0`. Adds transitive deps: `transformers`, `mlx-lm`, `librosa`, `numba`, `scikit-learn`. Venv grows from ~659MB to ~1.1GB.
- **Code**: `pipeline/asr.py` (ASREngine class), `config.py` (DEFAULT_ASR_MODEL)
- **User config**: Users with `asr_model = "Qwen/Qwen3-ASR-1.7B"` in their `config.toml` will need to update to an mlx-community model name, or the app should handle the old name gracefully.
- **Model download**: First launch after migration will download the 8bit model from HuggingFace (~1GB).

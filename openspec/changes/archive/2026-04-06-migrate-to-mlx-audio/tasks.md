## 1. Dependencies

- [x] 1.1 Replace `mlx-qwen3-asr>=0.3.2` with `mlx-audio[stt]>=0.4.0` in `python/pyproject.toml`
- [x] 1.2 Run `uv sync` and verify all deps install cleanly

## 2. Config

- [x] 2.1 Change `DEFAULT_ASR_MODEL` in `config.py` from `Qwen/Qwen3-ASR-1.7B` to `mlx-community/Qwen3-ASR-1.7B-8bit`
- [x] 2.2 Add legacy model name migration: if `asr_model` is `Qwen/Qwen3-ASR-1.7B`, map to the new default and log a warning

## 3. ASR Engine

- [x] 3.1 Rewrite `ASREngine` in `pipeline/asr.py` to use `mlx_audio.stt.load` and `model.generate()`
- [x] 3.2 Handle mlx-audio language return type (list → str normalization)
- [x] 3.3 Ensure audio input is passed as numpy array directly (not `(array, sr)` tuple)

## 4. Verification

- [x] 4.1 Verify model loads successfully with `mlx-community/Qwen3-ASR-1.7B-8bit`
- [x] 4.2 Test transcription of real speech audio through the full pipeline
- [x] 4.3 Test legacy config migration path (`Qwen/Qwen3-ASR-1.7B` → new default)
- [x] 4.4 Verify remote ASR provider still works unchanged

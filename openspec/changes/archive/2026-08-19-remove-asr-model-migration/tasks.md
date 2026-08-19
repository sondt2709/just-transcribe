## 1. Remove migration from config loading

- [x] 1.1 Delete `_LEGACY_ASR_MODEL` constant and the migration block in `Config.from_dict` in `python/src/just_transcribe/config.py`; keep `asr_model = data.get("asr_model", DEFAULT_ASR_MODEL)` as the only assignment
- [x] 1.2 Grep repo for remaining `_LEGACY_ASR_MODEL` / migration references (code, tests) and remove any leftovers

## 2. Verify

- [x] 2.1 Run/inspect existing python tests touching config loading; confirm none depend on migration behavior (update or remove any that do)
- [x] 2.2 Verify config round-trip: load a config with `asr_model = "Qwen/Qwen3-ASR-1.7B"` and confirm the value is preserved verbatim

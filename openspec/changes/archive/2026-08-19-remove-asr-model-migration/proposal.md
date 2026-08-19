## Why

The legacy ASR model name migration (added in v0.1.3 when mlx-qwen3-asr was replaced by mlx-audio) unconditionally rewrites `asr_model = "Qwen/Qwen3-ASR-1.7B"` to `mlx-community/Qwen3-ASR-1.7B-8bit` on every config load — including when `asr_provider = "remote"`, where `Qwen/Qwen3-ASR-1.7B` is the remote server's actual model ID. This silently breaks all remote transcription (every request 404s with "model does not exist") and cannot be worked around by editing the config, since the rewrite reapplies on each launch. The user base is small; manual reconfiguration or reinstall is acceptable, so the migration is not worth keeping.

## What Changes

- Remove the legacy ASR model name migration from config loading (`_LEGACY_ASR_MODEL` constant and the rewrite block in `Config.from_dict`).
- **BREAKING**: Users with `asr_provider = "local"` and the pre-v0.1.3 model name `Qwen/Qwen3-ASR-1.7B` in their config will no longer be auto-migrated; local ASR will fail to load that model until they update `asr_model` manually (or reinstall/reconfigure).
- The configured `asr_model` value is now always respected verbatim, for both local and remote providers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transcription-pipeline`: Remove the "Legacy model name in config" scenario — the system no longer rewrites `Qwen/Qwen3-ASR-1.7B` to `mlx-community/Qwen3-ASR-1.7B-8bit`; the configured model name is used as-is.

## Impact

- `python/src/just_transcribe/config.py`: delete `_LEGACY_ASR_MODEL` and the migration block in `from_dict` (~8 lines removed).
- `openspec/specs/transcription-pipeline/spec.md`: legacy-model-migration scenario removed.
- No Electron/renderer changes; no dependency changes.
- Fixes remote ASR being broken for configs whose server model ID is `Qwen/Qwen3-ASR-1.7B`.

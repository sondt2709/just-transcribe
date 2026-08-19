## Context

`Config.from_dict` in `python/src/just_transcribe/config.py` contains a legacy-model migration added in v0.1.3: any config with `asr_model = "Qwen/Qwen3-ASR-1.7B"` is rewritten to `mlx-community/Qwen3-ASR-1.7B-8bit` on load. The rewrite ignores `asr_provider`. For remote providers, `Qwen/Qwen3-ASR-1.7B` is a valid server-side model ID (it is the ID served by the user's vLLM instance), so the migration corrupts the config on every launch and all transcription requests fail with 404. The project owner has decided migrations are not worth supporting for this app's user base.

## Goals / Non-Goals

**Goals:**
- Configured `asr_model` is used verbatim for both local and remote providers.
- Remote ASR works again for servers whose model ID is `Qwen/Qwen3-ASR-1.7B`.

**Non-Goals:**
- No provider-conditional migration (considered and rejected — owner prefers no migration at all).
- No new error surfacing/UI for remote 404s (separate concern, out of scope).
- No changes to default model constants or local engine loading.

## Decisions

- **Delete the migration outright** rather than gating it on `asr_provider == "local"`. Rationale: small user base, migration code is a persistent foot-gun (rewrites user intent on every load), and a stale local model name fails loudly at model load where the log points at the model name. Alternative (provider-gated migration) rejected by owner.
- Remove `_LEGACY_ASR_MODEL` constant and the conditional block in `from_dict`; keep `asr_model = data.get("asr_model", DEFAULT_ASR_MODEL)` as the only assignment.

## Risks / Trade-offs

- [Pre-v0.1.3 local configs with `Qwen/Qwen3-ASR-1.7B` break local ASR load] → Accepted; users reconfigure via Settings or reinstall. Failure appears in backend.log at model load.

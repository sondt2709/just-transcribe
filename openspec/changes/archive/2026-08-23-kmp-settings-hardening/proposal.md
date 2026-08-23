# Proposal: kmp-settings-hardening

## Why

The KMP Settings screen makes it too easy to end up with a wrong or stale model configuration: model picks from Test Connection are lost by leaving without tapping Save (no warning), the Save button scrolls out of reach under the form, saved model names are never validated against the server, and there are no sensible model-name defaults (fresh installs show empty fields). Nothing warns the user before edits are discarded.

## What Changes

- Sensible model defaults on fresh installs: `asrModel` defaults to `Qwen/Qwen3-ASR-1.7B`, `llmModel` defaults to `Qwen/Qwen3-30B-A3B`. Server base URLs stay empty — no personal endpoints ship in the app (already true; becomes an explicit requirement).
- Test Connection (ASR and LLM alike): when the probe finds exactly one model, it is auto-selected into the draft.
- Save button pinned at the bottom of the screen, always visible above the keyboard; the form scrolls behind it.
- Leaving Settings with unsaved edits (back arrow or system back) asks the user to save or discard instead of silently dropping changes.
- Save re-verifies the configured model names against each server's `/v1/models`: **valid** saves; **invalid** (probe OK, model not listed) warns and blocks until corrected or explicitly overridden; **unknown** (probe unreachable/no model list) asks the user to confirm saving unverified.

## Capabilities

### New Capabilities

- `kmp-settings-integrity`: Model defaults, single-model auto-select, save-time model verification with valid/invalid/unknown outcomes, and no bundled personal server endpoints.
- `kmp-settings-edit-safety`: Always-reachable Save action and explicit save/discard confirmation when leaving with unsaved edits.

### Modified Capabilities

<!-- none — kmp-ux-improvements' kmp-settings-ux spec is still unarchived; this change introduces separate capabilities rather than deltas on main specs -->

## Impact

- `kmp/shared/.../AppConfig.kt` — model default values.
- `kmp/androidApp/.../SettingsScreen.kt` — pinned Save bar, unsaved-changes dialog, auto-select on single model, verification flow UI.
- `kmp/androidApp/.../MainActivity.kt` / `AppRoot` — system-back interception while Settings has unsaved edits.
- `kmp/shared/.../AsrClient.kt` — connection-test reuse for save-time verification (no API change expected).
- No impact on the desktop Electron/Python app or the Flutter prototype.

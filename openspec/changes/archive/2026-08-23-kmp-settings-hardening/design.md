# Design: kmp-settings-hardening

## Context

`SettingsScreen` keeps a `draft` (`remember(config) { mutableStateOf(config) }`) edited by free-text fields and Test Connection dropdowns; persistence happens only through the bottom Save button (`container.saveConfig`). The Save button scrolls with the form, back navigation discards the draft silently, probe results are screen-local state, and `AppConfig` defaults every field to empty. `AsrClient.testConnection(url, key)` already probes `/v1/models` and returns the model-id list — reusable for save-time verification.

## Goals / Non-Goals

**Goals:**
- Defaults: `asrModel = "Qwen/Qwen3-ASR-1.7B"`, `llmModel = "Qwen/Qwen3-30B-A3B"`; URLs/keys stay empty.
- Auto-select a single probe result (both sections).
- Pinned Save bar above the keyboard; scrollable form behind it.
- Save/discard dialog on back with dirty draft; system back intercepted.
- Save-time verification with valid / invalid / unknown outcomes per section.

**Non-Goals:**
- Replacing free-text language fields with dropdowns (tracked in kmp-ux-improvements territory, not here).
- Disabling backup (`allowBackup` stays on by user decision); guaranteeing instant cloud upload (Android owns the schedule).
- Any migration of already-persisted settings (existing non-empty values win over defaults by construction).

## Decisions

- **Defaults in `AppConfig`** (constructor defaults + `SettingsStore` fallbacks `?: default`): both read paths agree; a backup-restored or previously saved value always overrides. Alternative — placeholder-only UI hint — rejected: user wants real prefilled values that save as-is.
- **Scaffold `bottomBar` for the Save bar** with the existing `imePadding` moved to the bar container: Compose keeps the bar above the IME while the `Column` scrolls under it. Simplest structure that satisfies "always visible above keyboard".
- **Dirty check** = `draft != persisted config` (data-class equality). Back arrow and `BackHandler(enabled = dirty)` route to one `AlertDialog` with Save / Discard / Cancel. Save from the dialog runs the same verification flow as the Save bar.
- **Verification flow**: on Save, probe ASR and LLM servers concurrently via `testConnection`; classify each section: valid (model in list), invalid (probe OK, model absent), unknown (probe Err or empty list). Precedence: any invalid → warning dialog naming the section(s) with "Fix" (stay) / "Save anyway" (override); else any unknown → confirm dialog "server unreachable — save unverified?"; else save silently. LLM section unconfigured (empty base URL) counts as valid/skip — translation is optional by design.
- **Single-result auto-select**: in both Test Connection handlers, `if (r.models.size == 1) draft = draft.copy(<model> = r.models.single())`. Multi-result keeps current selection and feeds the dropdown (existing behavior).
- **Draft init race fix (opportunistic)**: keep `remember(config)` but the pinned-bar refactor must not change the reset semantics; acceptable because the dirty-dialog now protects user edits from silent loss in every navigation path.

- **Default Auto Backup, no app-side backup code**: settings ride Android's full-data Auto Backup (DataStore file included by default). A key-value agent + `dataChanged()` variant was tried for fresher uploads and reverted by user decision — less code to maintain outweighs upload freshness; the ~daily upload staleness window is accepted. Alternatives rejected: key-value agent (maintenance), Block Store (extra dependency for a guarantee no longer wanted), disabling backup (loses reinstall restore).

## Risks / Trade-offs

- [Save becomes a network round-trip] → probes run concurrently with a 10 s ktor timeout already configured; "Testing…"-style progress state on the Save button; unknown path never blocks saving permanently.
- [Strict invalid-blocking could fight nonstandard servers whose `/v1/models` omits served models] → "Save anyway" override on the invalid dialog.
- [System-back interception via `BackHandler` competes with activity-level navigation in `AppRoot`] → Settings visibility is plain Compose state (`showSettings`), so `BackHandler` inside `SettingsScreen` cleanly owns back while visible.

## Open Questions

- None.

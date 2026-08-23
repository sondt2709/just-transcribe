# Design: kmp-first-run-guidance

## Context

`AppRoot` (MainActivity.kt) currently renders Settings whenever `showSettings || !config.isAsrConfigured`, with `canClose = config.isAsrConfigured` hiding the back arrow on first run; system back then exits the activity and drops edits. `HomeScreen`'s record button is always enabled but its `onClick` no-ops when unconfigured (`if (configured) onToggle()`), with only a plain hint text. `SettingsScreen`'s Save is already `enabled = draft.isAsrConfigured` but gives no reason. `AppConfig.isAsrConfigured` defines the mandatory set: `asrBaseUrl` + `asrModel`.

## Goals / Non-Goals

**Goals:**
- Home-first launch; Settings always closable (unsaved-edits dialog covers first run).
- Disabled Record + error-styled guidance while `!isAsrConfigured`.
- Highlighted Settings action on home while unconfigured.
- Save's disabled state explained by naming missing mandatory fields.

**Non-Goals:**
- Treating the LLM server as mandatory (translation stays optional).
- Any change to save-time model verification or backup behavior.
- Desktop/Flutter changes.

## Decisions

- **Gating source of truth stays `AppConfig.isAsrConfigured`**; add pure `AppConfig.missingAsrFields(): List<String>` (shared, unit-tested) returning display names of empty mandatory fields so Home and Settings share one message source instead of duplicating strings.
- **AppRoot**: render Settings only on `showSettings`; drop the `canClose` parameter from `SettingsScreen` entirely (always closable) rather than passing `true` — one caller, dead flag otherwise. `BackHandler` and back arrow become unconditional.
- **Record button**: use the `enabled` parameter of `FilledIconButton` (disabled container/content colors from the theme) instead of the current always-enabled button with a no-op click — visual + functional gating in one place.
- **Home guidance**: an onboarding `Card` (default neutral container colors — deliberately NOT `errorContainer`; nothing is wrong, the user just hasn't set up yet) with a welcome title, a sentence naming what to set up (from `missingAsrFields()`), and an "Open Settings" button as the primary action. Shown on every launch until configured; the Settings save-hint uses neutral `onSurfaceVariant` for the same reason.
- **Settings highlight**: swap the plain `IconButton` for a `FilledIconButton` (primary container) when unconfigured — static emphasis, no animation (cheap, obvious, no distraction).
- **Save explanation**: under the pinned Save button, `bodySmall` error-colored text "Required: <missing fields>" when `!draft.isAsrConfigured`.

## Risks / Trade-offs

- [Removing forced Settings means a fresh user could ignore the highlight and see an inert app] → error banner names the exact fields and the highlighted button is adjacent; acceptable and matches the requested UX.
- [Dropping `canClose` changes `SettingsScreen`'s signature] → single call site (AppRoot); compile error catches any drift.

## Open Questions

- None.

# Proposal: kmp-first-run-guidance

## Why

On first run the KMP app force-opens Settings with no back affordance (system back exits the app, silently dropping edits), and once on the home screen an unconfigured app offers a tappable-looking Record button that silently does nothing. The user gets no clear signal of what is mandatory or where to fix it.

## What Changes

- First run lands on the home screen (Settings is no longer forced); Settings is always closable, so the unsaved-edits dialog protects first-run edits too.
- Record button is disabled (visually and functionally) while mandatory settings — ASR base URL and model — are missing.
- Home shows an error-styled message naming what is missing and pointing to Settings.
- The Settings button on home is visually highlighted while the app is unconfigured.
- Settings Save stays disabled when mandatory fields are empty and now shows a message naming the missing field(s), instead of a silently dead button.

## Capabilities

### New Capabilities

- `kmp-unconfigured-guidance`: Behavior of the app while mandatory configuration is missing — gated Record and Save actions with visible explanations, highlighted path to Settings, and the first-run flow landing on home with Settings always closable.

### Modified Capabilities

<!-- none — kmp-settings-edit-safety (unarchived change kmp-settings-hardening) is complementary: its unsaved-edits dialog now also applies on first run because Settings is always closable -->

## Impact

- `kmp/androidApp/.../MainActivity.kt` (AppRoot) — stop forcing Settings when unconfigured; Settings always closable.
- `kmp/androidApp/.../HomeScreen.kt` — disabled Record button, error message, highlighted Settings action.
- `kmp/androidApp/.../SettingsScreen.kt` — missing-mandatory-fields message under Save; drop the `canClose` special case.
- `kmp/shared/.../AppConfig.kt` — small pure helper listing missing mandatory fields (unit-tested).

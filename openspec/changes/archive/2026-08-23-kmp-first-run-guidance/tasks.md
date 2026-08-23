# Tasks: kmp-first-run-guidance

## 1. Shared helper

- [x] 1.1 `AppConfig.missingAsrFields(): List<String>` returning display names of empty mandatory fields ("ASR base URL", "ASR model"); unit test for empty/partial/full configs

## 2. First-run flow

- [x] 2.1 AppRoot: render Settings only on `showSettings`; remove `canClose` from `SettingsScreen` (back arrow + `BackHandler` unconditional)

## 3. Home gating

- [x] 3.1 Record button: `enabled = configured` on `FilledIconButton` (drop the no-op click guard); error-styled banner naming missing fields when unconfigured
- [x] 3.2 Highlight Settings action (`FilledIconButton`, primary container) while unconfigured

## 4. Settings save explanation

- [x] 4.1 Under the pinned Save button: error-colored "Required: <missing fields>" text when `!draft.isAsrConfigured`

## 5. Verification

- [x] 5.1 Shared tests green; androidApp compiles; manual: fresh install lands on home with disabled Record + highlighted Settings + banner; filling ASR URL+model enables Record; Save shows required-fields message until filled

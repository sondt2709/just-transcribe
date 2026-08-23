# Proposal: kmp-ux-improvements

## Why

The KMP Android app's home screen has usability gaps: the record FAB sits bottom-right (biased against left-handed use) and overlaps the last transcript item; the speaking indicator is a bare dot; transcripts cannot be copied, cleared, exported, or resumed after the app closes; the Settings form hides fields behind the keyboard and the LLM server has no connection test or model discovery like the ASR server does.

## What Changes

- Record button becomes a big circular mic button at center-bottom (equal reach for either hand). While recording it becomes a Stop button carrying a Google Meet-style speaking indicator (three bouncing bars driven by `speechActive`), replacing the title-bar dot.
- Transcript list gains bottom content padding so the last item scrolls clear of the record button.
- Tap-to-copy: tapping the original text or any translation row copies that text to the clipboard.
- Clear-all button near the record button wipes segments/translations/interim (no confirmation).
- Top bar gains Copy (whole transcript to clipboard) and Share (plain-text export via Android share sheet, which covers save-to-file) actions. Export format mirrors what the UI shows: speaker, language, text, and translations per segment.
- Transcript history persists across app restarts; after reopening, the user can continue the previous conversation (restored segments + translations, new recording appends) or start fresh.
- Settings form scrolls above the soft keyboard (IME-aware padding) so no field is hidden while typing.
- Translation (LLM) server section gains a Test Connection button probing `{base}/v1/models` and a model dropdown populated from the probe, matching the ASR section.
- App declares a proper adaptive launcher icon (derived from `flutter/icon.svg`: teal gradient + white mic) so release and debug APKs both show branding instead of the system default.
- Cleanups from verification: per-row copy uses the platform `ClipboardManager` (avoids the deprecated Compose `LocalClipboardManager`); `TranscriptStore.save` drops its dead empty-snapshot delete path.

## Capabilities

### New Capabilities

- `kmp-home-controls`: Home screen layout — centered circular record/stop button, Meet-style speaking indicator on the stop button, clear button placement, list bottom offset, continue-with-history control.
- `kmp-transcript-actions`: Copy single segment/translation, copy whole transcript, share/export as plain text, clear all.
- `kmp-transcript-history`: Persist segments and translations across process restarts; restore and continue a previous conversation with stable segment ids.
- `kmp-settings-ux`: IME-aware scrolling in Settings; LLM server Test Connection with model auto-detection and selection.
- `kmp-app-icon`: Adaptive launcher icon present in every build variant (release included) with themed-icon support.

### Modified Capabilities

<!-- none — existing specs cover the desktop app; the KMP app's behavior is introduced as new capabilities -->

## Impact

- `kmp/androidApp/.../HomeScreen.kt` — layout rework (Scaffold FAB removed in favor of custom bottom controls), indicator, tap-to-copy, clear/copy/share wiring.
- `kmp/androidApp/.../SettingsScreen.kt` — IME padding, LLM test button + model dropdown.
- `kmp/androidApp/.../JustTranscribeApp.kt` (AppContainer) — transcript store wiring, LLM connection test, clear/restore pass-through.
- `kmp/androidApp/` new `TranscriptStore.kt` — persistence (JSON on disk).
- `kmp/shared/.../PipelineController.kt` — `clearTranscript()`, `restore(...)`; start must not wipe restored history.
- `kmp/shared/.../AsrClient.kt` — seed segment counter above restored max id (avoid id collisions in the translations map).
- `kmp/androidApp/src/main/res/` + `AndroidManifest.xml` — new adaptive launcher icon resources and `android:icon` declaration.
- No impact on the desktop Electron/Python app.

# Tasks: kmp-settings-hardening

## 1. Defaults (shared)

- [x] 1.1 `AppConfig`: default `asrModel = "Qwen/Qwen3-ASR-1.7B"`, `llmModel = "Qwen/Qwen3-30B-A3B"`; `SettingsStore` read fallbacks use the same defaults
- [x] 1.2 Unit-test defaults (fresh `AppConfig()` and store read with empty prefs)

## 2. Settings screen structure (android)

- [x] 2.1 Move Save into a pinned `bottomBar` (Scaffold) with `imePadding` so it stays visible above the keyboard; form scrolls behind it
- [x] 2.2 Dirty detection (`draft != config`) + one save/discard/cancel `AlertDialog`; wire back arrow to it and add `BackHandler(enabled = dirty)` for system back
- [x] 2.3 Auto-select single Test Connection result into the draft for both ASR and LLM sections

## 3. Save-time verification (android)

- [x] 3.1 Implement save flow: concurrent `/v1/models` probes for ASR and (if configured) LLM; classify valid / invalid / unknown per section
- [x] 3.2 Invalid outcome: blocking dialog naming section(s), Fix / Save anyway; Unknown outcome: confirm save-unverified dialog; Valid: silent save; show in-progress state on Save
- [x] 3.3 Route dialog-initiated save (from the unsaved-changes dialog) through the same verification flow

## 4. Backup (android)

- [x] 4.1 Use default full-data Auto Backup: no `android:backupAgent`, no `SettingsBackupAgent`, no `BackupManager.dataChanged()` — remove the key-value backup code added earlier

## 5. Verification

- [x] 5.1 Build debug APK; manual matrix: fresh install shows model defaults; single-model server auto-selects; back with edits prompts; save against reachable server with wrong model warns; save with server down asks confirmation; save → `adb shell bmgr backupnow` → un/reinstall restores last-saved values

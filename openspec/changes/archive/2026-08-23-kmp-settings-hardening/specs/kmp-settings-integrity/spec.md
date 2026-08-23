# kmp-settings-integrity Spec

## ADDED Requirements

### Requirement: Model defaults, no bundled endpoints
On a fresh install (no persisted or backup-restored settings), `asrModel` SHALL default to `Qwen/Qwen3-ASR-1.7B` and `llmModel` SHALL default to `Qwen/Qwen3-30B-A3B`. Server base URLs and API keys SHALL default to empty — the app SHALL NOT ship any hardcoded server endpoint.

#### Scenario: Fresh install defaults
- **WHEN** the app starts with no stored settings
- **THEN** Settings shows the two model names pre-filled and both base-URL fields empty

### Requirement: Settings survive reinstall via platform Auto Backup
Settings SHALL rely on Android's default full-data Auto Backup (no custom backup agent, no manual backup scheduling code). A reinstall restores the most recent snapshot the system uploaded; upload timing is owned by the platform (roughly daily, idle + Wi-Fi), and that staleness window is accepted.

#### Scenario: Reinstall restores the last uploaded snapshot
- **WHEN** the system has completed a backup pass after a save and the app is uninstalled and reinstalled
- **THEN** Settings shows the values from that snapshot without any app-side backup code involved

### Requirement: Single probe result auto-selects
For both the ASR and LLM sections, when Test Connection returns exactly one model id, that model SHALL be auto-selected into the draft configuration (replacing the current draft value). With more than one result the current selection is kept and the list is offered.

#### Scenario: Server exposes one model
- **WHEN** Test Connection succeeds with a single model id
- **THEN** the model field is set to that id without further interaction

#### Scenario: Server exposes several models
- **WHEN** Test Connection succeeds with multiple model ids
- **THEN** the draft model is unchanged and the dropdown lists all returned ids

### Requirement: Save verifies model names
Saving settings SHALL verify each configured model name against its server's `/v1/models`, independently for ASR and LLM, with three outcomes: **valid** (model listed) saves silently; **invalid** (probe succeeded, model not listed) SHALL warn the user naming the section and block saving until corrected or explicitly overridden; **unknown** (probe failed or returned no usable list) SHALL ask the user to confirm saving unverified.

#### Scenario: Both models valid
- **WHEN** the user saves and both model names appear in their servers' model lists
- **THEN** settings persist without extra prompts

#### Scenario: Model not on server
- **WHEN** the user saves and a probe succeeds but the configured model is not in the returned list
- **THEN** a warning names the offending section and the save does not persist unless the user explicitly overrides

#### Scenario: Server unreachable at save time
- **WHEN** the user saves and a probe fails or yields no model list
- **THEN** the user is asked to confirm saving the unverified configuration, and declining keeps them on the form with edits intact

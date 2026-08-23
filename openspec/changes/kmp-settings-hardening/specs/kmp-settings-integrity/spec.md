# kmp-settings-integrity Spec

## ADDED Requirements

### Requirement: Model defaults, no bundled endpoints
On a fresh install (no persisted or backup-restored settings), `asrModel` SHALL default to `Qwen/Qwen3-ASR-1.7B` and `llmModel` SHALL default to `Qwen/Qwen3-30B-A3B`. Server base URLs and API keys SHALL default to empty — the app SHALL NOT ship any hardcoded server endpoint.

#### Scenario: Fresh install defaults
- **WHEN** the app starts with no stored settings
- **THEN** Settings shows the two model names pre-filled and both base-URL fields empty

### Requirement: Restored settings reflect the last save
Settings SHALL be backed up in key-value mode with the backup manager notified (`dataChanged()`) on every save, so a reinstall restores the most recently saved configuration rather than a stale snapshot (actual upload timing remains system-scheduled).

#### Scenario: Reinstall after changing the model
- **WHEN** the user saves a new model name, the system runs its queued backup pass, and the app is uninstalled and reinstalled
- **THEN** Settings shows the model saved last, not an earlier value

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

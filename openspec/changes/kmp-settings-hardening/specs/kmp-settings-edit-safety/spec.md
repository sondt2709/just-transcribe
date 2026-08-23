# kmp-settings-edit-safety Spec

## ADDED Requirements

### Requirement: Save action always reachable
The Settings Save action SHALL be pinned at the bottom of the screen, visible above the soft keyboard while any field is focused; the form content SHALL scroll independently behind it.

#### Scenario: Editing with keyboard open
- **WHEN** the user focuses any settings field and the keyboard is shown
- **THEN** the Save button remains visible and tappable without dismissing the keyboard

### Requirement: Unsaved edits are never silently discarded
Leaving Settings with a draft that differs from the persisted configuration — via the back arrow or the system back gesture/button — SHALL present a save/discard choice instead of dropping the edits. Choosing save runs the normal save flow (including model verification); choosing discard leaves the persisted configuration untouched; cancelling the dialog stays on the form.

#### Scenario: Back with unsaved changes
- **WHEN** the user picked a model from the Test Connection dropdown and presses system back without saving
- **THEN** a dialog offers save or discard, and the selection is not lost unless the user chooses discard

#### Scenario: Back with no changes
- **WHEN** the draft equals the persisted configuration and the user navigates back
- **THEN** Settings closes immediately with no dialog

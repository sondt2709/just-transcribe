# kmp-unconfigured-guidance Spec

## ADDED Requirements

### Requirement: First run lands on home with Settings reachable
On first run (no mandatory settings saved), the app SHALL show the home screen — Settings SHALL NOT be forced open. The Settings screen SHALL always offer a way back to home, and leaving with unsaved edits SHALL go through the existing save/discard confirmation.

#### Scenario: Fresh install launch
- **WHEN** the app starts with no ASR server configured
- **THEN** the home screen is shown with recording gated and clear guidance to open Settings

#### Scenario: Backing out of Settings on first run
- **WHEN** the user opens Settings on first run, edits a field, and presses system back
- **THEN** the save/discard dialog appears instead of the app closing and dropping the edits

### Requirement: Record is gated while unconfigured
While mandatory settings (ASR base URL and ASR model) are missing, the Record button SHALL be disabled — visually distinct and non-interactive — and the home screen SHALL show a neutral onboarding card (welcoming tone, NOT error styling) that names what still needs to be set up and offers a direct action to open Settings. The same card appears on every launch until configured.

#### Scenario: Unconfigured home screen
- **WHEN** mandatory settings are missing
- **THEN** the Record button is rendered disabled, taps do nothing, and an onboarding card (neutral colors) explains the setup steps and provides an "open Settings" action

#### Scenario: Configuration completed
- **WHEN** the user saves a valid ASR base URL and model
- **THEN** the Record button becomes enabled and the onboarding card disappears

### Requirement: Settings entry is highlighted while unconfigured
While mandatory settings are missing, the Settings action on the home screen SHALL be visually highlighted so the fix path is obvious; once configured it returns to its normal appearance.

#### Scenario: Unconfigured home screen
- **WHEN** the home screen is shown without mandatory settings
- **THEN** the Settings button is visually emphasized relative to its normal state

### Requirement: Save explains why it is disabled
The Settings Save action SHALL be disabled while any mandatory field is empty and SHALL be accompanied by a message naming the missing field(s) (ASR base URL, ASR model).

#### Scenario: Missing mandatory fields
- **WHEN** the ASR base URL is empty in the Settings draft
- **THEN** Save is disabled and a neutral (non-error-styled) message states that the ASR base URL is required

#### Scenario: Mandatory fields filled
- **WHEN** both ASR base URL and model are filled in the draft
- **THEN** Save is enabled and no missing-field message is shown

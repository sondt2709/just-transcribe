# kmp-settings-ux

## Purpose

Settings screen usability in the KMP Android app: the form stays usable with the soft keyboard open, and the Translation (LLM) server section has connection testing and model discovery at parity with the ASR section.

## Requirements

### Requirement: Settings form scrolls above the keyboard
The Settings screen SHALL apply IME-aware padding so that when the soft keyboard opens, the focused field remains visible and the whole form can scroll to any field over the keyboard.

#### Scenario: Editing a bottom field
- **WHEN** the user focuses a field near the bottom of the form and the keyboard opens
- **THEN** the field stays visible above the keyboard and the form scrolls through all fields

### Requirement: LLM server connection test
The Translation (LLM) server section SHALL provide a Test Connection button that probes `{base}/v1/models` with the entered base URL and API key, and displays the result like the ASR section does.

#### Scenario: Successful test
- **WHEN** the user taps Test Connection with a reachable OpenAI-compatible server
- **THEN** a success message shows the number of models found

#### Scenario: Failed test
- **WHEN** the server is unreachable or returns a non-2xx status
- **THEN** an error message with the cause is displayed

### Requirement: LLM model auto-detection and selection
After a successful LLM connection test, the LLM model field SHALL become a dropdown listing the returned model ids for selection; before any successful test it remains a free-text field.

#### Scenario: Pick a detected model
- **WHEN** the test returns model ids
- **THEN** the user can select one from the dropdown and it is saved as `llmModel`

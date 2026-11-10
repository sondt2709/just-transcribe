## ADDED Requirements

### Requirement: Export transcript to a file
The user SHALL be able to export the full transcript history to a file from the main window with an Export button next to Copy and Clear. The system SHALL open the macOS Save dialog with the file types Markdown (`.md`) and Text (`.txt`) and a default name `transcript-YYYYMMDD-HHMM.md`. The renderer SHALL NOT choose the file path. The main process SHALL write the Markdown format when the path does not end with `.txt`, and the plain-text format (the same format as Copy) when it ends with `.txt`.

#### Scenario: Export as Markdown
- **WHEN** the user clicks Export and saves as `call.md`
- **THEN** `call.md` contains the transcript in the Markdown export format

#### Scenario: Export as text
- **WHEN** the user clicks Export and saves as `call.txt`
- **THEN** `call.txt` contains the same text that Copy writes to the clipboard

#### Scenario: Cancel the dialog
- **WHEN** the user cancels the Save dialog
- **THEN** no file is written and no error is shown

#### Scenario: Empty transcript
- **WHEN** the transcript history is empty
- **THEN** the Export button is disabled

### Requirement: Markdown transcript export format
The Markdown export SHALL start with `# Transcript` and a line with the local date and time of the first segment. Each segment SHALL be one list item `- **[HH:MM:SS] <speaker>** (<lang>): <text>`. Each translation SHALL follow as a nested list item `  - <lang>: <text>`, in the configured target-language order.

#### Scenario: Segment with translation in Markdown
- **WHEN** a segment spoken at 14:32:05 by `Others` in `en` with the text "Hi" and the translation `vi: "Chào"` is exported as Markdown
- **THEN** the file contains `- **[14:32:05] Others** (en): Hi` followed by `  - vi: Chào`

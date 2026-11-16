# transcript-actions

## Purpose

Clearing the transcript and copying/exporting the full transcript as plain text, available from both the main window and the overlay.
## Requirements
### Requirement: Clear transcript from any window
The user SHALL be able to clear the transcript from the main window and from the overlay (interactive mode). Clearing SHALL empty the backend transcript history and the displayed transcript in every connected window, and SHALL NOT stop or interrupt recording.

#### Scenario: Clear from main window
- **WHEN** the user clicks the Clear button in the main window
- **THEN** the backend transcript history is emptied and both the main window and overlay show an empty transcript

#### Scenario: Clear from overlay
- **WHEN** the overlay is in interactive mode and the user clicks the Clear button in the drag-handle bar
- **THEN** the backend transcript history is emptied and all windows show an empty transcript

#### Scenario: Clear during recording
- **WHEN** recording is active and the user clears the transcript
- **THEN** recording continues and new segments appear normally after the clear

#### Scenario: Clear also removes interim text
- **WHEN** interim (partial) text is displayed and the user clears the transcript
- **THEN** the interim text is removed from the display

### Requirement: Copy transcript as plain text
The user SHALL be able to copy the entire transcript to the clipboard as plain text from the main window and from the overlay (interactive mode). The copied text SHALL come from the backend transcript history so the result is identical regardless of which window triggered it.

#### Scenario: Copy from main window
- **WHEN** the user clicks the Copy button in the main window
- **THEN** the full transcript history is fetched from the backend, formatted as plain text, and written to the system clipboard

#### Scenario: Copy from overlay
- **WHEN** the overlay is in interactive mode and the user clicks the Copy button in the drag-handle bar
- **THEN** the same full transcript text is copied, identical to a copy triggered from the main window

#### Scenario: Copy feedback
- **WHEN** the copy succeeds
- **THEN** the button shows a transient confirmation state (e.g., "Copied ✓") before reverting

#### Scenario: Copy with empty transcript
- **WHEN** the transcript history is empty and the user clicks Copy
- **THEN** nothing is written to the clipboard and no error is shown

### Requirement: Plain-text export format
Each copied segment SHALL be rendered as `[YYYY-MM-DD HH:MM:SS] <speaker> (<lang>): <text>` using the segment's wall-clock start time in the user's local timezone. Each translation SHALL be rendered on its own indented line below the segment as `    <lang>: <text>`, ordered by the configured target-language order. Interim (non-final) text SHALL be excluded.

#### Scenario: Segment with two translations
- **WHEN** a segment with original language `en` and translations `vi` and `ja` is exported
- **THEN** the output contains the original line followed by indented `vi:` and `ja:` lines in the config's target-language order

#### Scenario: Segment without translations
- **WHEN** a segment has no translations
- **THEN** the output contains only the original line with timestamp, speaker, and language

#### Scenario: Real-time timestamp
- **WHEN** a segment was spoken at 14:32:05 local time on 2026-08-20
- **THEN** its exported line begins with `[2026-08-20 14:32:05]`

### Requirement: Export transcript to a file
The user SHALL be able to export the full transcript history to a file from the main window with an Export button next to Copy and Clear. The system SHALL open the macOS Save dialog with the file types Markdown (`.md`) and Text (`.txt`) and a default name `transcript-YYYYMMDD-HHMM.md`. The renderer SHALL NOT choose the file path. The main process SHALL write the Markdown format when the path does not end with `.txt`, and the plain-text format (the same format as Copy) when it ends with `.txt`.

#### Scenario: Export as Markdown
- **WHEN** the user clicks Export and saves as `call.md`
- **THEN** `call.md` contains the transcript in the Markdown export format

#### Scenario: Export as text
- **WHEN** the user clicks Export, selects the Text format, and saves as `call.txt`
- **THEN** `call.txt` contains the same text that Copy writes to the clipboard

#### Scenario: Text extension typed with the Markdown format
- **WHEN** the user types `call.txt` but keeps the Markdown format
- **THEN** macOS saves `call.txt.md`, and the file contains the Markdown format

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


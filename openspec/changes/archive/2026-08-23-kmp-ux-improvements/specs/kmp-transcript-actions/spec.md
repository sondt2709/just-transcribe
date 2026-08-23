# kmp-transcript-actions

## ADDED Requirements

### Requirement: Tap-to-copy individual texts
Tapping a segment's original text SHALL copy that text to the clipboard; tapping a translation row SHALL copy that translation's text. On API < 33 the app SHALL show a "Copied" snackbar; on API 33+ it SHALL rely on the system clipboard overlay and show no extra toast.

#### Scenario: Copy original
- **WHEN** the user taps the original text of a segment
- **THEN** the clipboard contains exactly that segment's text

#### Scenario: Copy a translation
- **WHEN** the user taps the second translation row of a segment
- **THEN** the clipboard contains exactly that translation's text

### Requirement: Copy whole transcript
The top app bar SHALL provide a copy action that places the full transcript export text on the clipboard, disabled when the transcript is empty.

#### Scenario: Copy all
- **WHEN** the user taps the copy action with segments present
- **THEN** the clipboard contains the export-formatted text of every segment in order

### Requirement: Share transcript as plain text
The top app bar SHALL provide a share action that launches the Android share sheet with the export text as `text/plain`, disabled when the transcript is empty. Saving to a file is satisfied via the share sheet's file targets.

#### Scenario: Share
- **WHEN** the user taps the share action with segments present
- **THEN** the system share chooser opens with the full export text

### Requirement: Export format mirrors the UI
The export text SHALL render each segment exactly as displayed: a header line with speaker and uppercased language code, the original text, then one line per translation prefixed with its uppercased target language code; segments separated by a blank line.

#### Scenario: Segment with two translations
- **WHEN** a segment `You/EN "Hello"` has translations `vi "Xin chào"` and `ja "こんにちは"`
- **THEN** the export contains:
  ```
  You [EN]
  Hello
  [VI] Xin chào
  [JA] こんにちは
  ```

### Requirement: Clear all transcripts
A clear action SHALL remove all segments, translations, and interim text from the UI state and delete persisted history, without confirmation.

#### Scenario: Clear while idle
- **WHEN** the user clears while idle
- **THEN** the list is empty and the segment id counter resets so the next conversation starts at id 1

#### Scenario: Clear while recording
- **WHEN** the user clears during an active recording
- **THEN** the visible list empties, recording continues, and subsequent segment ids continue from the live counter (no reset)

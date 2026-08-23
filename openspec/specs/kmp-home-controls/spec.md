# kmp-home-controls

## Purpose

Home screen layout and record controls of the KMP Android app: a centered, hand-symmetric record/stop button with a Meet-style speaking indicator, clear/resume controls beside it, and a transcript list that never hides behind the controls.

## Requirements

### Requirement: Centered circular record control
The home screen SHALL present the primary record control as a large circular button (approximately 80dp) horizontally centered at the bottom of the screen, replacing the bottom-end extended FAB.

#### Scenario: Idle state shows mic
- **WHEN** the pipeline is idle and the app is configured
- **THEN** the centered circle shows a mic icon in the primary container color, and tapping it starts recording

#### Scenario: Recording state acts as stop
- **WHEN** the pipeline is recording
- **THEN** the centered circle uses the error container color and tapping it stops recording

#### Scenario: Not configured
- **WHEN** no ASR server is configured
- **THEN** tapping the record control does not start recording

### Requirement: Meet-style speaking indicator on the stop button
While recording, the stop button SHALL display a Google Meet-style indicator of three vertical bars; the top app bar SHALL NOT display a speaking dot.

#### Scenario: User is speaking
- **WHEN** recording is active and `speechActive` is true
- **THEN** the three bars animate their heights continuously (equalizer motion)

#### Scenario: User is silent
- **WHEN** recording is active and `speechActive` is false
- **THEN** the three bars render as static short dots without animation

### Requirement: Transcript list clears the bottom controls
The transcript list SHALL include enough bottom content padding (≈120dp) that the last item can scroll fully above the bottom control cluster.

#### Scenario: Scrolled to the end
- **WHEN** the list is scrolled to its end
- **THEN** the last segment card is fully visible above the record button

### Requirement: Clear button near the record control
A clear button SHALL be displayed beside the centered record control whenever the transcript or interim text is non-empty, and SHALL clear without a confirmation dialog.

#### Scenario: Clear tapped
- **WHEN** the user taps the clear button
- **THEN** all segments, translations, and interim text are removed immediately and persisted history is deleted

### Requirement: Resume button for previous conversation
When the app launches with persisted history and an empty transcript list, a resume button SHALL appear beside the record control; tapping it restores the previous conversation and starts recording.

#### Scenario: Resume after reopen
- **WHEN** the user stopped recording, closed the app, reopened it, and taps resume
- **THEN** the previous segments and translations reappear and recording continues, with new segments appended after the restored ones

#### Scenario: No history
- **WHEN** no persisted history exists
- **THEN** the resume button is not shown

#### Scenario: Fresh start ignores history
- **WHEN** persisted history exists and the user taps the mic (not resume) on an empty screen
- **THEN** a new conversation starts with an empty list and segment ids starting from 1

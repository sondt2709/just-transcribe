## MODIFIED Requirements

### Requirement: Overlay caption rendering
The overlay SHALL display the most recent transcript segments with compact styling. It SHALL show 5-10 lines of text including original transcription and translations. The overlay SHALL render a dark background of `rgba(0, 0, 0, 0.4)` behind the captions for readability, with small UI-appropriate font size. When a segment has a translation, the translation SHALL be the primary text and the original SHALL be the secondary text.

#### Scenario: Live caption display
- **WHEN** a new transcript segment arrives via IPC from the main process
- **THEN** the overlay appends the segment text and scrolls to show the most recent content, keeping at most 10 lines visible

#### Scenario: Translation display in overlay
- **WHEN** a segment has associated translations
- **THEN** the overlay shows each translation below the original in a larger, bright, non-italic style, and shows the original in a smaller, dimmed style

#### Scenario: Segment without translation
- **WHEN** a segment has no translation
- **THEN** the overlay shows the original in the bright style

#### Scenario: No layout jump when a translation arrives
- **WHEN** a translation arrives for a segment that is already displayed
- **THEN** the original keeps its font size and only its color changes to the dimmed style

#### Scenario: Interim text display in overlay
- **WHEN** an interim (partial) transcript arrives
- **THEN** the overlay shows it in a dimmed/italic style that updates in place

#### Scenario: No transcript data
- **WHEN** the overlay is visible but no transcript segments exist
- **THEN** the overlay shows a minimal "Listening..." indicator

### Requirement: 9-position overlay placement
The overlay window SHALL support 9 placement positions arranged in a 3x3 grid: top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right. The default position SHALL be bottom-center. The position SHALL be configurable in settings and persisted in config.toml. The grid SHALL apply to the work area of the display that holds the overlay.

#### Scenario: Default position
- **WHEN** the overlay is shown for the first time with no saved preference and no saved placement
- **THEN** the overlay appears at the bottom-center of the primary display's work area

#### Scenario: User changes position
- **WHEN** the user selects a different position in the settings 3x3 grid picker
- **THEN** the overlay moves to the new position on the display that holds the overlay, and the preference and the resulting placement are saved to config.toml

#### Scenario: Position persistence
- **WHEN** the app restarts and the user had previously set overlay position to "top-right"
- **THEN** the overlay appears at top-right when next shown

#### Scenario: Grid pick on a secondary display
- **WHEN** the overlay is on a secondary display and the user selects "bottom-right" in the grid picker
- **THEN** the overlay moves to the bottom-right of the secondary display's work area, not of the primary display

#### Scenario: Position calculation
- **WHEN** the overlay is positioned at any of the 9 grid positions
- **THEN** the overlay window is sized to 30% of the work area width and 50% of the work area height, and placed at the corresponding grid position with a 20-point margin inside the work area (accounting for menu bar and dock)

## ADDED Requirements

### Requirement: Overlay placement persistence across displays
The app SHALL save the overlay placement (display ID, relative position, size) to config.toml when the user drags or resizes the overlay. The app SHALL restore the saved placement on launch and SHALL apply it again when displays are added, removed, or change their work area. The relative position SHALL be the fraction of the free space in the work area, so the overlay stays fully inside the work area of any display.

#### Scenario: Restore on a secondary display after restart
- **WHEN** the user drags the overlay to a secondary display and restarts the app with that display connected
- **THEN** the overlay appears at the same bounds on the secondary display

#### Scenario: Saved display removed
- **WHEN** the overlay is on a secondary display and that display is unplugged
- **THEN** the overlay moves to the primary display at the same relative position, fully inside its work area, and the saved placement still names the secondary display

#### Scenario: Saved display connected again
- **WHEN** the saved display is connected again
- **THEN** the overlay moves back to the saved bounds on that display

#### Scenario: User drag while the saved display is missing
- **WHEN** the saved display is unplugged and the user drags the overlay on another display
- **THEN** the new placement is saved with the ID of the display that now holds the overlay

#### Scenario: Work area change
- **WHEN** the work area of the overlay's display shrinks (resolution change, dock shown)
- **THEN** the overlay is clamped to stay fully inside the new work area

#### Scenario: No saved placement
- **WHEN** config.toml has no saved placement
- **THEN** the overlay uses the grid position on the primary display

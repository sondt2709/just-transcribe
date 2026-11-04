# overlay-window

## Purpose

Transparent always-on-top caption overlay of the macOS Electron app: caption rendering, placement on one or more displays, interaction modes and controls.
## Requirements
### Requirement: Transparent overlay window
The app SHALL provide a transparent, frameless, always-on-top overlay window for displaying live captions. The overlay window SHALL have no title bar, no shadow, a fully transparent background, and SHALL float above all other windows.

#### Scenario: Overlay window creation
- **WHEN** the user switches to overlay mode
- **THEN** a new BrowserWindow is created with `transparent: true`, `frame: false`, `alwaysOnTop: true`, `hasShadow: false`, `skipTaskbar: true`

#### Scenario: Overlay window transparency
- **WHEN** the overlay window is displayed
- **THEN** areas without caption text are fully transparent and show the desktop/apps underneath

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

### Requirement: Overlay interaction modes
The overlay window SHALL support two interaction modes: **interactive** (default) and **click-through**. In interactive mode the overlay SHALL be draggable via a drag-handle region and resizable. In click-through mode the overlay SHALL ignore all mouse events, forwarding them to applications underneath, and SHALL NOT be focusable. The active mode SHALL be applied by the main process via `setIgnoreMouseEvents(clickThrough, { forward: true })`.

#### Scenario: Interactive mode by default
- **WHEN** the overlay is shown and the user has never enabled click-through
- **THEN** the overlay is draggable via its drag handle and resizable via its edges

#### Scenario: Click-through mode behavior
- **WHEN** click-through mode is active and the user clicks on an area where the overlay is displayed
- **THEN** the click passes through to the application underneath the overlay

#### Scenario: Click-through mode does not steal focus
- **WHEN** click-through mode is active and the user is typing in another application
- **THEN** the overlay does not intercept keyboard input or steal focus

#### Scenario: Overlay chrome hidden when click-through
- **WHEN** click-through mode is active
- **THEN** the overlay hides its drag handle, resize indicator, lock button, and transcript action buttons (Copy, Clear), showing captions only

#### Scenario: Mode restored on launch
- **WHEN** the app launches with `overlay_click_through = true` in config.toml
- **THEN** the overlay window is created in click-through mode

### Requirement: Overlay mode toggle controls
The user SHALL be able to switch the overlay between interactive and click-through modes from the tray context menu at any time while overlay mode is active. The overlay window SHALL additionally display a lock button in its drag-handle bar that switches from interactive to click-through mode. Unlocking (click-through back to interactive) SHALL be available from the tray menu, since a click-through overlay cannot receive clicks on its own button.

#### Scenario: Lock from overlay button
- **WHEN** the overlay is in interactive mode and the user clicks the lock button in the drag-handle bar
- **THEN** the overlay switches to click-through mode and `overlay_click_through = true` is persisted to config.toml

#### Scenario: Lock from tray menu
- **WHEN** the overlay is in interactive mode and the user clicks "Lock Overlay (Click-Through)" in the tray menu
- **THEN** the overlay switches to click-through mode and the preference is persisted

#### Scenario: Unlock from tray menu
- **WHEN** the overlay is in click-through mode and the user clicks "Unlock Overlay (Interactive)" in the tray menu
- **THEN** the overlay becomes draggable and resizable again, its chrome reappears, and `overlay_click_through = false` is persisted

### Requirement: Overlay transcript action buttons
The overlay SHALL display Copy and Clear icon buttons in its drag-handle bar (alongside the lock button) while in interactive mode. The buttons SHALL trigger the same backend-based copy and clear actions as the main window.

#### Scenario: Copy from overlay drag-handle bar
- **WHEN** the overlay is in interactive mode and the user clicks the Copy button
- **THEN** the full transcript is fetched from the backend, formatted, and written to the clipboard, with transient visual confirmation

#### Scenario: Clear from overlay drag-handle bar
- **WHEN** the overlay is in interactive mode and the user clicks the Clear button
- **THEN** the backend transcript history is cleared and the overlay caption area empties

### Requirement: Exclusive window mode
The main window and overlay window SHALL be mutually exclusive. Only one SHALL be visible at a time. Switching between modes hides one and shows the other.

#### Scenario: Switch from main to overlay
- **WHEN** the user activates overlay mode (via tray menu)
- **THEN** the main window hides and the overlay window appears at the configured position

#### Scenario: Switch from overlay to main
- **WHEN** the user activates main window mode (via tray menu)
- **THEN** the overlay window hides and the main window shows

#### Scenario: Mode persists across recording sessions
- **WHEN** the user is in overlay mode and stops then starts recording again
- **THEN** the overlay remains the active display mode

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


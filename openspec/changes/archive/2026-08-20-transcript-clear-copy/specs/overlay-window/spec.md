## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Overlay transcript action buttons
The overlay SHALL display Copy and Clear icon buttons in its drag-handle bar (alongside the lock button) while in interactive mode. The buttons SHALL trigger the same backend-based copy and clear actions as the main window.

#### Scenario: Copy from overlay drag-handle bar
- **WHEN** the overlay is in interactive mode and the user clicks the Copy button
- **THEN** the full transcript is fetched from the backend, formatted, and written to the clipboard, with transient visual confirmation

#### Scenario: Clear from overlay drag-handle bar
- **WHEN** the overlay is in interactive mode and the user clicks the Clear button
- **THEN** the backend transcript history is cleared and the overlay caption area empties

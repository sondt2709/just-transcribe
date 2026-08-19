## REMOVED Requirements

### Requirement: Click-through overlay
**Reason**: Always-click-through was never shipped and conflicts with drag/resize positioning. Replaced by a two-mode model where click-through is an explicit user toggle.
**Migration**: See "Overlay interaction modes" below. Default behavior is interactive; click-through is opt-in via tray menu or overlay lock button.

## ADDED Requirements

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
- **THEN** the overlay hides its drag handle, resize indicator, and lock button, showing captions only

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

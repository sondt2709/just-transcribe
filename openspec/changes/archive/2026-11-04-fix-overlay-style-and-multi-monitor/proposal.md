## Why

The overlay shows the translation as dim grey italic text, but the translation is what the user reads. The overlay also loses its position on a multi-monitor setup: it always uses the primary display, so a restart, a grid pick in Settings, or a monitor unplug moves it to the wrong place.

## What Changes

- The translation is the primary text in the overlay (bright, not italic, larger). The original transcript is the secondary text (dim, smaller). A segment without a translation keeps the original as primary text.
- The overlay background opacity goes from `0.3` to `0.4` black.
- The overlay saves its bounds and its display when the user drags or resizes it.
- At startup, the overlay goes back to the saved display and bounds, clamped into the display work area.
- When the saved display is removed, the overlay moves to the primary display at the same relative position. When the saved display comes back, the overlay moves back to it.
- When a display work area changes, the overlay is clamped into it.
- A grid pick in Settings places the overlay on the display that holds the overlay, not on the primary display.
- The spec sizing text is corrected to the real ratios (30% width, 50% height of the work area).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `overlay-window`: caption rendering makes the translation primary; 9-position placement uses the overlay's display; new requirement for placement persistence across restarts and display changes.

## Impact

- `electron/src/main/index.ts`: overlay creation, `set-electron-config` handler, `screen` event listeners.
- `electron/src/main/overlayPlacement.ts`: new pure placement module.
- `electron/src/main/setup.ts`: two new keys in `config.toml`: `overlay_display_id` and `overlay_bounds`.
- `electron/src/renderer/components/OverlayView.tsx`: caption styles and background.
- `electron/package.json`: new `test` script that uses the Node built-in test runner. No new dependency.

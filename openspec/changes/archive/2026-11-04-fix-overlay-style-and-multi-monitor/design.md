## Context

`calculateOverlayBounds` in `electron/src/main/index.ts` always uses `screen.getPrimaryDisplay()`. The app does not save the overlay bounds after a drag or a resize, and it does not listen to `screen` events. Result on a two-monitor setup:

- A restart puts the overlay back on the primary display.
- A grid pick in Settings moves the overlay to the primary display.
- When a monitor is unplugged, macOS moves the window by itself. When the monitor comes back, the overlay stays where macOS put it.

The overlay renders the translation as `text-white/50 italic` under a `text-white/90` original, so the text the user reads most is the weakest.

## Goals / Non-Goals

**Goals:**
- The translation is the most readable text in the overlay.
- The overlay background is darker (`rgba(0,0,0,0.4)`).
- The overlay keeps the display and the position that the user picked across restarts, unplugs and replugs.
- No new dependency.

**Non-Goals:**
- Other overlay UX changes (font settings, line count, auto-hide).
- Main window placement.

## Decisions

### 1. Pure placement module
`electron/src/main/overlayPlacement.ts` holds all geometry as pure functions with no Electron import: grid bounds, placement from bounds, bounds from placement, display lookup, and config string parse and serialize. `index.ts` only adapts Electron `Display` objects and window events.
- Why: the logic can be tested with `node --test` (Node 24 type stripping) without Electron or a test framework.
- Alternative: add vitest. Rejected, because it adds a dependency for a few pure functions.

### 2. Placement stored as fractions of the free space
The saved placement is `{ displayId, fx, fy, width, height }`. `fx = (x - workArea.x) / (workArea.width - width)`, clamped to 0..1, and `fy` is the same for the vertical axis. To restore it: clamp the size to the target work area, then `x = workArea.x + round(fx * (workArea.width - width))`.
- Why: on the same display the result is the same position. On a different or resized display, a bottom-right overlay stays bottom-right and always fits.
- Alternative: absolute offsets. Rejected, because a position on a 2560-wide monitor goes off a 1512-wide laptop.

Config keys in `~/.just-transcribe/config.toml` (strings, written by the existing `writeElectronConfig`):
- `overlay_display_id = "3"`
- `overlay_bounds = "0.4375,1,454,433"` (fx, fy, width, height)

A config without these keys keeps the old behavior: the grid position on the primary display.

### 3. Target display
If a display with the saved `displayId` exists, the overlay goes there. If not, it goes to the primary display with the same fractions. The app does not match a display by label, because Electron on macOS gives a stable `CGDirectDisplayID` for the same monitor.

### 4. When to save
- Save on the window `moved` and `resized` events.
- Do not save when the app moved the window itself (`setBounds` from placement code). A short suppress window after each programmatic `setBounds` handles this.
- Do not save a move that the user did not start (no `will-move` / `will-resize`) when the saved display is missing or when a display event came less than 1.5 s ago. This stops the macOS relocation on an unplug from overwriting the saved monitor. A user drag on the laptop while the monitor is unplugged still saves.
- On macOS, `moved` fires during the whole drag, so the save waits 400 ms after the last event.
- On macOS, a `setBounds` from code that changes the size emits only `resize`, not `moved` or `resized`. The grid pick therefore saves its placement explicitly.

### 5. Display events
On `display-added`, `display-removed` and `display-metrics-changed`, the app waits 300 ms (debounce), resolves the placement again from the saved config and the current displays, and calls `setBounds` if the result differs.

### 6. Grid pick
The `set-electron-config` handler computes the grid bounds in the work area of the display that holds the overlay now (largest intersection), then saves that placement.

### 7. Caption style
- If a segment has a translation, the translation is `text-sm text-white`, not italic. The original stays `text-xs` and changes to `text-white/55`.
- If a segment has no translation, the original stays `text-xs text-white/90`.
- The original font size does not change, so the layout does not jump when the translation arrives.

## Risks / Trade-offs

- [`will-move` may not fire for a `-webkit-app-region: drag` drag on macOS] → The save still happens when the saved display exists. Only a drag while the saved monitor is unplugged is affected.
- [macOS gives a new display ID to the same monitor on a different port or dock] → The overlay goes to the primary display. The next drag saves the new ID.
- [A programmatic `setBounds` emits `moved` after the suppress window] → The saved placement equals the bounds that the app computed, so the result is the same.

## Migration Plan

No migration. Old configs fall back to the grid position on the primary display. Rollback: revert the PR. The two extra config keys are ignored by older builds.

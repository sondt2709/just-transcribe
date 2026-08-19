## Why

The overlay window is currently always interactive (draggable, resizable, focusable), which contradicts the original click-through spec and means captions can block clicks on apps underneath. Users need both: an interactive mode to position/size the overlay, and a click-through mode once they have settled on a placement.

## What Changes

- Overlay gains two interaction modes: **interactive** (draggable, resizable — current behavior) and **click-through** (mouse events pass through to apps underneath).
- Tray context menu gains a toggle item (visible when overlay mode is active): "Lock Overlay (Click-Through)" / "Unlock Overlay (Interactive)".
- Overlay renderer shows a small lock button in the drag-handle bar to switch to click-through without opening the tray menu.
- The chosen mode persists in `config.toml` as `overlay_click_through` (default `false` — interactive) and is restored on launch.
- Overlay visual chrome (drag handle, resize indicator) hides in click-through mode.
- Resolves the click-through spec violation found in verification of `tray-and-overlay-mode`: spec updated to describe the two-mode model instead of always-click-through.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `overlay-window`: "Click-through overlay" requirement replaced by "Overlay interaction modes" — interactive by default, click-through on user toggle, mode persisted.
- `tray-icon`: Tray context menu requirement extended with overlay lock/unlock toggle item shown while overlay mode is active.
- `app-config`: New `overlay_click_through` boolean field (default `false`), Electron-only, read/written directly by the main process.

## Impact

- `electron/src/main/index.ts`: overlay window creation (`setIgnoreMouseEvents`), IPC handler for mode toggle, config wiring.
- `electron/src/main/tray.ts`: menu template gains conditional lock/unlock item; new callback.
- `electron/src/main/setup.ts`: `overlay_click_through` in Electron config read/write + defaults.
- `electron/src/preload/index.ts`: expose toggle API to overlay renderer.
- `electron/src/renderer/components/OverlayView.tsx`: lock button, hide chrome in click-through mode.
- No backend (Python) changes.

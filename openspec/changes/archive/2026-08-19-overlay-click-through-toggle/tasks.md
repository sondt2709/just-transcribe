## 1. Config

- [x] 1.1 Add `overlay_click_through` (default `false`) to Electron config defaults, interface, regex read, and write logic in `electron/src/main/setup.ts`

## 2. Main process mode handling

- [x] 2.1 Track `clickThrough` state in `electron/src/main/index.ts`, initialized from config on launch
- [x] 2.2 Add `applyOverlayInteractionMode()` — calls `overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true })` and `setFocusable(!clickThrough)`, sends `overlay-mode-changed { clickThrough }` to overlay renderer
- [x] 2.3 Apply mode on overlay window creation (after load) and on toggle
- [x] 2.4 Add `setOverlayClickThrough(v)` toggle function: update state, apply to window, persist via `writeElectronConfig`, refresh tray menu
- [x] 2.5 Add `set-overlay-click-through` IPC handler wired to the toggle function

## 3. Tray menu

- [x] 3.1 Extend `TrayCallbacks` with `onToggleClickThrough`; track `isClickThrough` in `electron/src/main/tray.ts`
- [x] 3.2 Add conditional menu item (only when `isOverlayMode`): "Lock Overlay (Click-Through)" / "Unlock Overlay (Interactive)"
- [x] 3.3 Update `updateTrayState` signature to accept click-through state; update call sites in `index.ts`

## 4. Preload + overlay renderer

- [x] 4.1 Expose `setOverlayClickThrough(v)` (invoke) and `onOverlayModeChanged(cb)` (listener) in `electron/src/preload/index.ts` + type defs
- [x] 4.2 Add `clickThrough` state to `OverlayView.tsx` fed by `onOverlayModeChanged`
- [x] 4.3 Add lock button in drag-handle bar (interactive mode only) calling `setOverlayClickThrough(true)`, tooltip "Unlock from tray menu"
- [x] 4.4 Hide drag handle, resize indicator, and lock button when `clickThrough` is true

## 5. Sync specs

- [x] 5.1 Update `openspec/specs/overlay-window/spec.md`: remove "Click-through overlay" requirement, add "Overlay interaction modes" + "Overlay mode toggle controls" per delta
- [x] 5.2 Update `openspec/specs/tray-icon/spec.md`: replace "Tray context menu" requirement with modified version per delta
- [x] 5.3 Update `openspec/specs/app-config/spec.md`: add "Overlay click-through configuration" requirement per delta

## 6. Verify

- [x] 6.1 Typecheck/build electron app (`npm run typecheck` or `npm run build` in `electron/`)
- [x] 6.2 Manual test: lock via overlay button → clicks pass through, chrome hidden; unlock via tray → drag/resize restored; restart preserves mode

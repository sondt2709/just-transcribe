## Context

The overlay window (added in `tray-and-overlay-mode`) shipped interactive: `movable`, `resizable`, `focusable`, with a drag handle rendered by `OverlayView.tsx`. The synced `overlay-window` spec still mandates always-click-through via `setIgnoreMouseEvents(true, { forward: true })` — a requirement the implementation never honored. Verification flagged this as a critical divergence.

The resolution (user decision): keep interactivity as the default so users can position and size the overlay, and add an explicit toggle to lock the overlay into click-through mode once placement is settled.

## Goals / Non-Goals

**Goals:**
- Two overlay interaction modes: interactive (default) and click-through (locked).
- Toggle from tray context menu and from a lock button on the overlay itself.
- Mode persisted in `config.toml` (`overlay_click_through`) and restored on launch.
- Overlay chrome (drag handle, resize hint, lock button) hidden while click-through.
- Update `overlay-window` main spec so the spec matches reality.

**Non-Goals:**
- Unlocking from the overlay itself while click-through (impossible — overlay ignores mouse; unlock happens via tray only).
- Hover-based temporary interactivity (mouseenter/leave toggling) — fiddly on transparent windows, not needed.
- Per-position or per-display mode memory.
- Persisting user-dragged position/size back to config (existing behavior unchanged: config stores grid position only).

## Decisions

### D1: Mode state owned by main process, applied via `setIgnoreMouseEvents`

Main process tracks `clickThrough: boolean`, applies it with `overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true })` and `setFocusable(!clickThrough)`. Renderer never calls Electron window APIs directly.

**Why**: `setIgnoreMouseEvents` is a main-process window API; the tray toggle also lives in main. Single owner avoids split-brain between tray and overlay button.

**Alternative considered**: renderer toggling via preload calling `getCurrentWindow()` — rejected, no `@electron/remote` in this app, and tray would still need main-side state.

### D2: Toggle surfaces — tray menu item + overlay lock button (one-way)

- Tray menu (only while overlay mode active): `Lock Overlay (Click-Through)` when interactive, `Unlock Overlay (Interactive)` when locked. Works in both directions.
- Overlay drag-handle bar gets a small lock button: interactive → click-through only. When click-through, the button is unreachable by definition (window ignores mouse), so unlock is tray-only.

**Why**: user asked for both. One-way overlay button is inherent to click-through, not a design choice.

### D3: `overlay_click_through` config field, default `false`

New Electron-only field in `~/.just-transcribe/config.toml`, joins `overlay_position` / `overlay_enabled` / `launch_at_login` in `readElectronConfig`/`writeElectronConfig` (regex-based TOML read/write in `setup.ts`, same pattern). Persisted on every toggle; applied when overlay window is created and on launch restore.

**Why default interactive**: first-run users need to drag/resize before locking makes sense. Matches user framing: click-through "means user already settled".

### D4: Renderer learns mode via IPC push

Main sends `overlay-mode-changed { clickThrough }` to the overlay window on every toggle and after overlay creation. Preload exposes `onOverlayModeChanged(cb)` and `setOverlayClickThrough(v)` (invoke → main handler → applies + persists + rebuilds tray menu). OverlayView hides drag handle, resize hint, and lock button when `clickThrough === true`.

**Why**: chrome must hide when locked or the overlay shows dead interactive affordances; push keeps renderer dumb, main authoritative.

## Risks / Trade-offs

- [Risk] User locks overlay, forgets how to unlock → Mitigation: tray menu always shows "Unlock Overlay (Interactive)" while locked; lock button gets a tooltip "Unlock from tray menu".
- [Risk] `setIgnoreMouseEvents` with `forward: true` plus `transparent: true` has quirks on some macOS versions (forwarding only affects hover/mousemove) → Acceptable: we need clicks to pass through, which plain ignore gives us; `forward: true` kept for hover-through parity with original spec.
- [Trade-off] Toggle item in tray menu only when overlay mode active → menu stays short in main-window mode; slight discoverability cost, acceptable.

## Migration Plan

No migration. Missing `overlay_click_through` in existing config.toml falls back to default `false` (interactive) — identical to current shipped behavior. Rollback: remove field handling; stale key in config.toml is ignored harmlessly.

## Open Questions

None.

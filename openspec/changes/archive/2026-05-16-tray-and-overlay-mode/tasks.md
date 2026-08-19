## 1. Config Foundation

- [x] 1.1 Add Electron-side config reader/writer for `~/.just-transcribe/config.toml` that reads/writes `overlay_position`, `overlay_enabled`, and `launch_at_login` fields directly (not through backend API)
- [x] 1.2 Define defaults: `overlay_position = "bottom-center"`, `overlay_enabled = false`, `launch_at_login = false`

## 2. Tray Icon

- [x] 2.1 Create tray icon assets (idle and recording variants, macOS template images)
- [x] 2.2 Initialize `Tray` in main process on app ready, with idle icon
- [x] 2.3 Build context menu with: Start/Stop Recording, Show Main Window/Show Overlay, separator, Settings, Quit
- [x] 2.4 Wire Start/Stop Recording menu items to POST `/api/start` and `/api/stop` via the existing backend HTTP calls
- [x] 2.5 Update tray icon between idle/recording variants when recording state changes
- [x] 2.6 Rebuild context menu dynamically when recording state or active mode changes

## 3. Window Lifecycle Changes

- [x] 3.1 Change `window-all-closed` handler to NOT quit — app stays alive in tray
- [x] 3.2 Intercept main window `close` event to hide instead of destroy
- [x] 3.3 Add "Show Main Window" tray menu action that calls `mainWindow.show()`
- [x] 3.4 Handle Cmd+Q to actually quit (stop recording, kill backend, destroy tray, exit)
- [x] 3.5 Implement launch-at-login toggle using `app.setLoginItemSettings()`, wired to config

## 4. WebSocket in Main Process

- [x] 4.1 ~~Move WebSocket connection management from renderer to main process~~ Kept WebSocket in renderer — each window manages its own connection. Simpler architecture, avoids ws bundling issues with electron-vite.
- [x] 4.2 ~~Forward transcript events from main process to active window via IPC~~ Not needed — renderer connects directly.
- [x] 4.3 ~~Update renderer `useTranscript` hook to receive data via IPC~~ Kept original hook with direct WebSocket.
- [x] 4.4 Verify no WebSocket connection exists when idle in tray (battery drain check) — WebSocket only connects when backend port is available; overlay hidden when not active.

## 5. Overlay Window

- [x] 5.1 Create overlay BrowserWindow with `transparent: true`, `frame: false`, `alwaysOnTop: true`, `hasShadow: false`, `skipTaskbar: true`
- [x] 5.2 Create overlay renderer page (separate HTML entry point) with compact transcript display — semi-transparent dark background per line, small font, 10-line max
- [x] 5.3 Implement 9-position placement calculator using `screen.getPrimaryDisplay().workAreaSize` — window sized ~60% width, ~15% height
- [x] 5.4 Set `setIgnoreMouseEvents(true, { forward: true })` for click-through behavior
- [x] 5.5 Wire overlay to receive transcript data via IPC from main process
- [x] 5.6 Show "Listening..." indicator when overlay is visible but no segments exist

## 6. Exclusive Mode Switching

- [x] 6.1 Track `activeMode: 'main' | 'overlay'` state in main process
- [x] 6.2 Implement mode switch: hide main window + show overlay (and vice versa)
- [x] 6.3 Wire tray menu "Show Overlay" / "Show Main Window" to mode switch
- [x] 6.4 Persist `overlay_enabled` to config.toml on mode switch
- [x] 6.5 Restore saved mode on app launch (read `overlay_enabled` from config)

## 7. Settings UI Updates

- [x] 7.1 Add 3x3 grid position picker component to Settings for overlay placement
- [x] 7.2 Add "Launch at Login" toggle to Settings
- [x] 7.3 Wire position picker to save `overlay_position` to config and reposition overlay window immediately
- [x] 7.4 Wire "Open Settings" tray menu item to show main window with settings panel visible

## 8. Integration & Polish

- [x] 8.1 Handle tray-only recording flow: start recording from tray in overlay mode → overlay appears automatically
- [ ] 8.2 Manual test: backend-survives-window-close — close main window, verify backend still running, reopen from tray
- [ ] 8.3 Manual test: launch-at-login — enable setting, verify login item registered, verify app starts to tray on reboot
- [ ] 8.4 Manual test: overlay position persistence across restarts
- [ ] 8.5 Manual test: exclusive mode — verify only one window visible at a time in all transitions

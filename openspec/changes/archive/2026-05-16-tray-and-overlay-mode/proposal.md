## Why

Users want to start transcribing as fast as possible — ideally one click from the menu bar — and see captions overlaid on whatever app they're using (Zoom, browser, etc.) without switching windows. Currently the app requires opening a full window, and captions are only visible inside that window. A tray icon + overlay mode makes the app feel like a lightweight system utility rather than a standalone application.

## What Changes

- **System tray icon**: App lives in the macOS menu bar with a context menu for quick start/stop recording, toggling overlay, and accessing the main window
- **Background persistence**: Closing the main window hides it instead of quitting; the app stays alive in the tray with the Python backend running
- **Login item support**: Optional "launch at login" setting so the backend is pre-warmed when the user needs it
- **Transparent overlay window**: A separate frameless, transparent, always-on-top BrowserWindow that displays the last 5-10 lines of transcript text (original + translations)
- **9-position overlay placement**: User selects overlay position from a 3x3 grid (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right)
- **Exclusive window mode**: Main window and overlay are mutually exclusive — enabling overlay hides the main window and vice versa
- **Battery-conscious design**: WebSocket connection and transcript streaming only active while recording; no background drain when idle in tray
- **Tray-only recording flow**: User can start recording from tray menu without ever opening the main window — overlay appears automatically

## Capabilities

### New Capabilities
- `tray-icon`: System tray lifecycle, context menu, and tray-only recording flow
- `overlay-window`: Transparent always-on-top caption overlay with 9-position placement and compact transcript rendering

### Modified Capabilities
- `electron-shell`: Window close behavior changes (hide instead of quit), app lifecycle now tray-driven
- `app-config`: New config fields for overlay position, overlay enabled state, and launch-at-login preference

## Impact

- **electron/src/main/index.ts**: Major changes — tray creation, window lifecycle, overlay window management, revised quit behavior
- **electron/src/renderer/**: New overlay renderer route/page, settings UI for overlay position picker
- **electron/src/preload/**: May need additional IPC channels for overlay control
- **openspec/specs/electron-shell/**: Spec updates for tray-driven lifecycle
- **openspec/specs/app-config/**: Spec updates for new config fields
- **No Python backend changes**: All changes are Electron-side; the backend API and WebSocket protocol remain unchanged
- **No new dependencies**: Electron's built-in `Tray`, `BrowserWindow` transparency, and `nativeImage` cover all needs

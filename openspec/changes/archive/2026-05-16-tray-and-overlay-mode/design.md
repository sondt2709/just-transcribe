## Context

Just Transcribe is an Electron + Python app for real-time audio transcription. Currently it has a single `BrowserWindow` — closing it quits the app and kills the Python backend. Users want a "system utility" feel: always available from the menu bar, captions overlaid on other apps, and no unnecessary battery drain when idle.

The app already has:
- A Python backend spawned as a subprocess communicating via HTTP/WebSocket
- A React renderer with transcript, controls, and settings components
- `config.toml` for persisting user preferences
- `titleBarStyle: 'hiddenInset'` macOS-native look

## Goals / Non-Goals

**Goals:**
- App persists in tray when main window is closed, with Python backend staying warm
- One-click start/stop recording from tray context menu
- Transparent overlay window showing live captions over other apps
- User-configurable overlay position (3x3 grid)
- Zero battery drain when idle in tray (no WebSocket, no streaming)
- Optional launch-at-login for instant availability

**Non-Goals:**
- Global keyboard shortcuts for overlay toggle (may add later)
- Overlay on external displays (overlay follows primary screen for now)
- Overlay customization beyond position (font size, opacity, colors — future)
- Dock icon management (keep dock icon visible for now)
- Windows/Linux tray support (macOS only, matching current scope)

## Decisions

### D1: Two-window architecture (main + overlay)

The overlay is a **separate `BrowserWindow`** loading a dedicated overlay HTML page, not a second route in the same renderer.

**Why**: Overlay needs `transparent: true`, `alwaysOnTop: true`, `frame: false`, `skipTaskbar: true` — fundamentally different window properties from the main window. A separate window also isolates overlay rendering from main window state.

**Alternative considered**: Single window with CSS overlay mode → Rejected because `transparent` and `alwaysOnTop` are window-level properties that can't be toggled dynamically without recreating the window.

### D2: Exclusive mode — main window XOR overlay

When the user enables overlay mode, the main window hides and the overlay window appears. When they disable overlay (via tray menu), the overlay closes and the main window shows.

**Why**: The user specified exclusive mode. This also simplifies state management — only one window consumes transcript data at a time.

**Implementation**: The main process tracks `activeMode: 'main' | 'overlay'`. Switching modes hides one window and shows the other. The tray menu reflects the current mode.

### D3: WebSocket lifecycle tied to recording state, not window visibility

The WebSocket connection to the Python backend is only established when recording starts and torn down when recording stops. The overlay/main window subscribes to transcript data through the main process (IPC bridge), not directly via WebSocket.

**Why**: The user explicitly wants no background battery drain. A WebSocket that's only alive during recording means zero overhead when idle in tray.

**Architecture**:
```
Recording active:
  Main Process ──WebSocket──► Python Backend
       │
       ├──IPC──► Main Window (if visible)
       └──IPC──► Overlay Window (if visible)

Idle in tray:
  Main Process (no connections)
  Python Backend (listening but idle)
```

**Alternative considered**: Each renderer connects its own WebSocket → Rejected because it doubles connections and makes lifecycle harder to manage. The main process as a single subscriber + IPC fan-out is cleaner.

### D4: Overlay window sizing and positioning

The overlay occupies a fixed region of the screen based on the selected position from a 3x3 grid. The overlay window is sized to ~60% screen width and ~15% screen height, positioned according to the grid selection.

**Position grid**:
```
┌──────────┬──────────┬──────────┐
│ top-left │ top-ctr  │ top-right│
├──────────┼──────────┼──────────┤
│ mid-left │  center  │mid-right │
├──────────┼──────────┼──────────┤
│ bot-left │ bot-ctr  │bot-right │
└──────────┴──────────┴──────────┘
```

Each position maps to an `(x, y)` offset calculated from `screen.getPrimaryDisplay().workAreaSize`. The overlay window is not user-draggable — position is set via settings only.

### D5: Overlay is click-through by default

The overlay window uses `setIgnoreMouseEvents(true, { forward: true })` to be fully click-through. Users interact with apps underneath. To reposition, they use the tray menu → settings or open the main window.

**Why**: Captions should never interfere with the user's workflow. YouTube CC model — visible but non-interactive.

### D6: Tray icon with context menu

The tray icon provides:
- **Start/Stop Recording** (toggles based on state)
- **Show Main Window / Show Overlay** (switches mode)
- **Separator**
- **Settings** (opens main window on settings tab)
- **Quit** (actually quits, kills backend)

The tray icon changes appearance to indicate recording state (e.g., filled vs outline microphone).

### D7: Config additions stored in existing config.toml

New fields in `~/.just-transcribe/config.toml`:
- `overlay_position = "bottom-center"` (default)
- `overlay_enabled = false` (default — starts in main window mode)
- `launch_at_login = false` (default)

These integrate with the existing `app-config` spec. The Python backend doesn't need to know about these — they're Electron-only settings read/written by the main process directly.

**Why**: Overlay and tray are purely Electron concerns. No need to route through the backend API.

## Risks / Trade-offs

**[Risk] Overlay appears in screen recordings/screenshots** → Acceptable for now. Users doing screen recordings with captions likely want them visible. Can add `setContentProtection` toggle later.

**[Risk] Python backend stays warm in tray drains some memory (~200-400MB for model)** → Mitigation: This is the explicit tradeoff for instant recording start. Could add "unload model after N minutes idle" later, but not in this change.

**[Risk] macOS Gatekeeper may flag always-on-top transparent windows** → Low risk. Electron's built-in capabilities are well-supported. No special entitlements needed beyond what we already have.

**[Trade-off] Main process as WebSocket proxy adds a hop** → Acceptable. The data volume is small (text segments), and the IPC overhead is negligible. The simplification of lifecycle management is worth it.

**[Trade-off] Exclusive mode means no "both windows visible"** → User-specified. Simplifies the architecture. Can revisit if needed.

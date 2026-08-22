# Proposal: fix-setup-bg-and-tray-icon

## Why

Two visible defects in the packaged app (DMG/Homebrew installs):

1. **White setup page**: the first-run Setup view renders on a white background with near-white text (barely readable), then the app "turns black" after setup. The Setup root div is missing the dark background class, the `<body>` has no background, and the BrowserWindow has no `backgroundColor` — so Chromium's default white shows through.
2. **Invisible tray icon**: the tray icon is transparent (clickable but not visible) in packaged builds. `tray.ts` loads icons from `process.resourcesPath`, but `extraResources` in `package.json` only copies `bin/audiotee` and the Python source — the tray PNGs are never bundled, so `nativeImage.createFromPath` returns an empty image.

## What Changes

- Bundle tray icon PNGs (`trayIdleTemplate.png`, `trayIdleTemplate@2x.png`, `trayRecording.png`, `trayRecording@2x.png`) into the packaged app's Resources directory via `extraResources`.
- Apply the app's dark background (`neutral-950`) consistently: Setup view root, document body, and `BrowserWindow.backgroundColor` (prevents white flash on window creation).
- Decision: the app stays **dark-only** for now (Option A). Following OS light/dark mode is out of scope for this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tray-icon`: tray icon assets SHALL be bundled in packaged builds so the icon is actually visible (not an empty image) when installed from DMG/Homebrew.
- `app-packaging`: DMG packaging SHALL include tray icon resources in `Contents/Resources`.
- `electron-shell`: all renderer views (including first-run Setup) and the window itself SHALL render with the dark background; no white flash or white page at any point.

## Impact

- `electron/package.json` — `build.mac.extraResources` additions.
- `electron/src/renderer/components/Setup.tsx` — dark background on root container.
- `electron/src/renderer/index.html` — body background class.
- `electron/src/main/index.ts` — `backgroundColor` on main window creation.
- No backend, config, or API changes. No breaking changes.

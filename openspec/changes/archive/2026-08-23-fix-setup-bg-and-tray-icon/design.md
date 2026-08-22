# Design: fix-setup-bg-and-tray-icon

## Context

Two packaging/styling defects in production builds:

- **Tray icon**: `tray.ts:getTrayIcon()` resolves icons from `process.resourcesPath` in production, but `build.mac.extraResources` never copies `resources/tray*.png` there. `nativeImage.createFromPath` on a missing file returns an empty image — macOS reserves a clickable status-item slot but draws nothing. Dev works because the dev branch of the path points at `electron/resources/`.
- **White setup page**: the app is styled dark-only via hardcoded Tailwind classes (`bg-neutral-950` etc.), but three layers miss the background: `Setup.tsx` root div (no `bg-*` class), `index.html` `<body>` (only `text-white`), and `BrowserWindow` (no `backgroundColor`, Chromium defaults to white). Every other view sets `bg-neutral-950` on its root, which is why the app "turns black" after setup.

## Goals / Non-Goals

**Goals:**
- Tray icon visible in DMG/Homebrew installs; template image keeps adapting to menu bar light/dark.
- Setup view (and any future view that forgets a root background) renders dark; no white flash on window creation.

**Non-Goals:**
- Following OS light/dark mode in the renderer (Option B — deliberately deferred; app stays dark-only).
- Overlay window changes (already `transparent: true` with its own styling).
- New icon artwork.

## Decisions

1. **Bundle tray icons via `extraResources` with a filtered copy of `resources/` → Resources root.**
   Add entries copying the four tray PNGs to `Contents/Resources/` so the existing production path `join(process.resourcesPath, '<name>.png')` works unchanged. Alternative considered: load icons from `app.getAppPath()` (inside asar) — nativeImage can read from asar, but changing the path logic touches dev/prod branching for no benefit; copying assets is the smaller diff and matches how `audiotee` is already shipped.

2. **Defense in depth for dark background — set it at all three layers:**
   - `BrowserWindow.backgroundColor: '#0a0a0a'` (Tailwind `neutral-950`) in `createMainWindow()` — kills white flash before first paint. Overlay window keeps `#00000000`.
   - Body gets `bg-neutral-950` at runtime in `main.tsx` for non-overlay windows only — safety net for any view missing a root background. (Not in `index.html`: the overlay window loads the same document with `transparent: true` and an opaque body would break its translucent panel.)
   - `bg-neutral-950` on `Setup.tsx` root div — matches the convention every other view already follows.
   Alternative considered: only fix Setup.tsx. Rejected: window-level white flash would remain, and the next view added without a root bg would regress the same way.

## Risks / Trade-offs

- [Hardcoded `#0a0a0a` duplicates Tailwind's neutral-950] → acceptable; single constant, commented. Revisit if Option B (OS theme) lands.
- [`extraResources` filter typo would silently ship no icons again] → verify by listing `Contents/Resources/` in the built DMG before release.

## Migration Plan

Ships as a normal `fix:` release via semantic-release. No config or data migration. Rollback = revert commit.

## Open Questions

None.

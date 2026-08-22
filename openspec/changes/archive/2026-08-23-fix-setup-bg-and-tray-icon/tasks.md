# Tasks: fix-setup-bg-and-tray-icon

## 1. Tray icon packaging

- [x] 1.1 Add the four tray PNGs (`trayIdleTemplate.png`, `trayIdleTemplate@2x.png`, `trayRecording.png`, `trayRecording@2x.png`) to `build.mac.extraResources` in `electron/package.json`, copied to Resources root

## 2. Dark background

- [x] 2.1 Add `bg-neutral-950` to Setup view root div in `electron/src/renderer/components/Setup.tsx`
- [x] 2.2 Add `bg-neutral-950` to body at runtime for non-overlay windows in `electron/src/renderer/main.tsx` (overlay body must stay transparent)
- [x] 2.3 Set `backgroundColor: '#0a0a0a'` on main BrowserWindow in `electron/src/main/index.ts` (overlay keeps `#00000000`)

## 3. Verification

- [x] 3.1 Run `npm run build` and package with `npx electron-builder --mac`; verify `Contents/Resources/` contains the four tray PNGs
- [x] 3.2 Launch packaged app: tray icon visible; simulate first-run (setup view) shows dark background

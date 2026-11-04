## 1. Failing test on the base behavior

- [x] 1.1 Move `calculateOverlayBounds` unchanged into `electron/src/main/overlayPlacement.ts` (pure, no Electron import) and use it from `index.ts`
- [x] 1.2 Add `"test": "node --test src/**/*.test.ts"` to `electron/package.json` and exclude `*.test.ts` from `tsconfig.node.json`
- [x] 1.3 Add `overlayPlacement.test.ts` with the display data captured from the real `screen.getAllDisplays()`; run `npm test` and keep the failure output

## 2. Placement logic

- [ ] 2.1 Implement `gridBounds`, `displayForBounds`, `placementFromBounds`, `boundsFromPlacement`, `resolveOverlayBounds`, `parsePlacement`, `serializePlacement`
- [ ] 2.2 Run `npm test` until it passes; break the fix one time to show the test fails, then restore

## 3. Main process wiring

- [ ] 3.1 Read and write `overlay_display_id` and `overlay_bounds` in `setup.ts`
- [ ] 3.2 Use `resolveOverlayBounds` in `createOverlayWindow`
- [ ] 3.3 Save the placement on `moved` / `resized`, with the programmatic suppress and the `will-move` / `will-resize` rule
- [ ] 3.4 Re-apply the placement on `display-added`, `display-removed`, `display-metrics-changed` (300 ms debounce)
- [ ] 3.5 Grid pick in `set-electron-config` uses the display that holds the overlay, and saves the placement

## 4. Overlay style

- [ ] 4.1 Background `rgba(0, 0, 0, 0.4)` in `OverlayView.tsx`
- [ ] 4.2 Translation `text-sm text-white` not italic; original `text-xs`, `text-white/55` when translated, else `text-white/90`

## 5. Verification

- [ ] 5.1 `npm run build` passes
- [ ] 5.2 Real app via the main-process debugger: grid pick on the secondary display stays there; restart restores the secondary display
- [ ] 5.3 Real app screenshots before and after with the same spoken sentence
- [ ] 5.4 Package the DMG and install the app for the human's unplug/replug test

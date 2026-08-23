# Proposal: kmp-material-you-theme

## Why

The KMP Android app renders with the Material 3 baseline palette (default purple) — neither the user's Material You wallpaper colors nor the Just Transcribe teal brand. Desktop (Electron) and the launcher icon are teal; the app should match the platform's theming expectations and the brand.

## What Changes

- `JustTranscribeTheme` adopts Material You dynamic color (`dynamicLightColorScheme`/`dynamicDarkColorScheme`) on Android 12+ (API 31), following the standard Android pattern (`Build.VERSION.SDK_INT >= Build.VERSION_CODES.S` gate).
- On API 26–30, falls back to branded static light/dark color schemes built from the Material Teal palette (m2.material.io Teal 50–900), consistent with the Electron accent and the launcher icon gradient (#009688/#00695C).
- Dark mode respected in both paths (existing `isSystemInDarkTheme()`).

## Capabilities

### New Capabilities

- `kmp-app-theming`: App color scheme behavior — dynamic Material You on supported devices, branded teal fallback otherwise, dark-mode aware.

### Modified Capabilities

<!-- none -->

## Impact

- `kmp/androidApp/.../MainActivity.kt` — `JustTranscribeTheme` only (single-file change).
- No dependency changes (dynamic scheme APIs ship in compose material3 already in use).
- Recording stop button keeps `errorContainer` (red) semantics in both paths.

# Tasks: kmp-material-you-theme

## 1. Implement

- [x] 1.1 Define `LightTealScheme`/`DarkTealScheme` in `MainActivity.kt` from the design's role table (M2 Teal palette)
- [x] 1.2 Rework `JustTranscribeTheme`: `Build.VERSION_CODES.S` gate → dynamic light/dark schemes via `LocalContext.current`; teal fallback otherwise; keep `isSystemInDarkTheme()` switch

## 2. Verify

- [x] 2.1 Build debug + release APKs — green
- [ ] 2.2 On-device check: Android 12+ shows wallpaper-derived colors (and themed icon still works); dark mode switches scheme; stop button stays red

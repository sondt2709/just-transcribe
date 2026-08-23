# Design: kmp-material-you-theme

## Context

`JustTranscribeTheme` (`MainActivity.kt`) currently passes stock `lightColorScheme()`/`darkColorScheme()` — M3 baseline purple. minSdk 26, target/compile 36; compose material3 already on the classpath provides `dynamicLightColorScheme`/`dynamicDarkColorScheme` (API 31+). All UI colors already flow through `MaterialTheme.colorScheme` roles (primaryContainer mic button, secondaryContainer badges/tonal buttons, errorContainer stop/recording states) — no hardcoded UI colors to chase.

## Goals / Non-Goals

**Goals:**
- Material You: wallpaper-derived palette on Android 12+ (user preference wins over brand).
- Branded teal fallback on API 26–30 from the m2.material.io Teal palette.
- Dark mode correct in both paths.

**Non-Goals:**
- No settings toggle to force brand colors (option C — deliberately skipped).
- No per-component brand overrides on dynamic scheme (keep it fully native on 12+).
- No changes to error/red recording semantics.

## Decisions

### 1. Standard gate pattern (Android best practice)

```kotlin
val scheme = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    dark -> DarkTealScheme
    else -> LightTealScheme
}
```

Same convention as Google's Now in Android sample and the [Material 3 Compose docs](https://developer.android.com/develop/ui/compose/designsystems/material3): version gate + complete-ColorScheme fallback. Context from `LocalContext.current`.

### 2. Teal fallback schemes from the M2 palette (user-provided, m2.material.io)

Only the roles the app actually uses are overridden; unspecified roles keep M3 neutral defaults (neutrals are near-monochrome, so no purple leakage in practice — tertiary is unused by this UI).

| Role | Light | Dark |
|---|---|---|
| primary | Teal 700 `#00796B` (≥4.5:1 on white) | Teal 200 `#80CBC4` |
| onPrimary | `#FFFFFF` | Teal 900 `#004D40` |
| primaryContainer | Teal 100 `#B2DFDB` | Teal 800 `#00695C` |
| onPrimaryContainer | Teal 900 `#004D40` | Teal 100 `#B2DFDB` |
| secondary | Teal 800 `#00695C` (translated-text color, needs contrast) | Teal 200 `#80CBC4` |
| onSecondary | `#FFFFFF` | Teal 900 `#004D40` |
| secondaryContainer | Teal 50 `#E0F2F1` | Teal 900 `#004D40` |
| onSecondaryContainer | Teal 900 `#004D40` | Teal 100 `#B2DFDB` |

primaryContainer vs secondaryContainer intentionally differ so the mic button and lang badges don't render identically.

### 3. Single-file scope

Everything lives in `JustTranscribeTheme`; schemes as private top-level vals in `MainActivity.kt`. No new module/file — matches current project layout where the theme already sits there.

## Risks / Trade-offs

- [Wallpaper palette may look nothing like the brand on Android 12+] → accepted per option B; brand identity carried by the launcher icon and pre-31 devices.
- [Partial scheme override could leak baseline tones in unused roles] → audited: UI uses primary/secondary/error families + neutrals only; error and neutrals are correct defaults.
- [Dynamic scheme requires Activity/app Context] → `LocalContext.current` inside the composable; no leak concerns.

## Open Questions

None.

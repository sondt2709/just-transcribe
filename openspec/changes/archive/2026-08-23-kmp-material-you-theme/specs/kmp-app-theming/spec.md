# kmp-app-theming

## ADDED Requirements

### Requirement: Material You dynamic color on supported devices
On Android 12+ (API 31), the app SHALL build its Material 3 color scheme from the system dynamic (wallpaper-derived) palette via `dynamicLightColorScheme`/`dynamicDarkColorScheme`.

#### Scenario: Wallpaper-derived colors
- **WHEN** the app runs on Android 12+ with Material You available
- **THEN** app surfaces (record button, badges, buttons) use the wallpaper-derived palette, matching other Material You apps

#### Scenario: Dark mode with dynamic color
- **WHEN** the system is in dark mode on Android 12+
- **THEN** the dynamic dark scheme is used

### Requirement: Branded teal fallback below Android 12
On API 26–30, the app SHALL use static light/dark color schemes built from the Material Teal palette (m2.material.io Teal 50–900), with light primary Teal 700 `#00796B` and dark primary Teal 200 `#80CBC4`, and container roles chosen so primary and secondary containers are visually distinct.

#### Scenario: Light fallback
- **WHEN** the app runs below API 31 in light mode
- **THEN** the mic button renders on Teal 100 `#B2DFDB` (primaryContainer) and primary elements use Teal 700 `#00796B` — no baseline purple visible

#### Scenario: Dark fallback
- **WHEN** the app runs below API 31 in dark mode
- **THEN** primary elements use Teal 200 `#80CBC4` and containers use Teal 800/900 — no baseline purple visible

### Requirement: Error semantics unchanged
The recording stop state SHALL continue using the scheme's error container roles in both theming paths.

#### Scenario: Recording state
- **WHEN** recording is active under either dynamic or fallback theming
- **THEN** the stop button uses `errorContainer`/`onErrorContainer` (red family)

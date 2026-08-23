# kmp-app-icon

## ADDED Requirements

### Requirement: Launcher icon in every build variant
The Android app SHALL declare a launcher icon in the main manifest (`android:icon`, plus `android:roundIcon`) backed by resources in the main source set, so every build variant — release APK included — shows the app's own icon instead of the system default.

#### Scenario: Release APK shows the icon
- **WHEN** the release APK is installed on a device
- **THEN** the launcher shows the Just Transcribe icon (teal gradient background, white microphone), not the generic Android icon

#### Scenario: Debug APK shows the same icon
- **WHEN** the debug APK is installed
- **THEN** the launcher shows the identical icon

### Requirement: Adaptive icon with themed-icon support
The icon SHALL be an adaptive icon (vector background + foreground; minSdk 26 makes density PNGs unnecessary) matching the existing brand asset `flutter/icon.svg`, and SHALL include a monochrome layer so Android 13+ themed icons render correctly.

#### Scenario: Launcher mask shapes
- **WHEN** a launcher applies a circle or squircle mask
- **THEN** the mic artwork stays fully inside the 66dp safe zone (no clipping)

#### Scenario: Themed icon
- **WHEN** themed icons are enabled on Android 13+
- **THEN** the launcher renders the monochrome mic layer tinted to the wallpaper palette

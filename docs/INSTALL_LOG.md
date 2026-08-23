# Install Log

Running record of everything added to the machine while building this PoC, so it
can be reproduced or cleaned up. Started 2026-06-01.

## Pre-existing (not installed by us)
- Homebrew 5.1.14
- `adb` (Android Debug Bridge 1.0.41)
- JDK 25.0.2 (system) — ⚠️ too new for AGP 8.13.2 / Gradle 8.7; a JDK 17 is needed for the Android build
- Python 3.14.3 (system)
- brew formulae already present: `portaudio`, `libsndfile` (back `sounddevice` / `soundfile`)

## Environment gaps blocking the Android half (not yet resolved)
- No Android SDK; `ANDROID_HOME` unset (need cmdline-tools + `platforms;android-36` + `build-tools` + `platform-tools`)
- No JDK 17 (have 25)
- No system `gradle` (needed once to generate the Gradle wrapper)
- No Android device connected (`adb devices` empty)

## Installed by us

### Python (server/.venv) — 2026-06-01
- Created venv: `server/.venv` using system Python 3.14.3
- pip packages (loosened from the plan's pins because Python 3.14 lacks wheels for the
  originally pinned numpy 2.1.3 / scipy 1.14.1): see resolved versions below.

Resolved versions (Python 3.14.3 venv, installed 2026-06-01):
- websockets 15.0.1
- sounddevice 0.5.5
- soundfile 0.13.1
- numpy 2.4.6
- scipy 1.17.1
- pytest 9.0.3
- pytest-asyncio 1.4.0
- (transitive) cffi 2.0.0

Note: websockets 15.x uses the single-argument connection handler `async def
handler(websocket)` (the legacy `path` second arg was removed in v11) — code and
tests must follow that signature.

To remove: `rm -rf server/.venv` (nothing installed system-wide for the Python half).

### Android toolchain — 2026-06-01 (CLI-driven, user-approved)
- `brew install openjdk@17` → JDK 17 at `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
  (keg-only; not registered with `/usr/libexec/java_home`. Gradle is pointed at it via
  `org.gradle.java.home` in `kmp/gradle.properties`, NOT via global JAVA_HOME.)
- `brew install --cask android-commandlinetools` → SDK root `/opt/homebrew/share/android-commandlinetools`,
  `sdkmanager` linked into `/opt/homebrew/bin`.
- `sdkmanager` packages (licenses accepted via `yes | sdkmanager --licenses`):
  `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`.
- `brew install gradle` → Gradle 9.5.1 at `/opt/homebrew/bin/gradle` (runs under JDK 17). Used ONLY
  to bootstrap the Gradle wrapper; the build runs the pinned wrapper (Gradle 8.14.3) under JDK 17.
- `ANDROID_HOME` is NOT exported globally; `kmp/local.properties` carries `sdk.dir=/opt/homebrew/share/android-commandlinetools` (git-ignored).

To remove: `brew uninstall openjdk@17`, `brew uninstall --cask android-commandlinetools`,
`rm -rf /opt/homebrew/share/android-commandlinetools` (SDK packages live under the cask dir).

### Still required from the user
- A physical Android phone connected with USB debugging authorized (for Task 15 acoustic e2e). `adb devices` currently empty.

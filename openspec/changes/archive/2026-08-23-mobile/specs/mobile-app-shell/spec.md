## ADDED Requirements

### Requirement: Kotlin Multiplatform project structure
The system SHALL be a Kotlin Multiplatform project under `kmp/` with a `shared` module (pure logic in `commonMain`, platform code behind `expect/actual` in `androidMain`, tests in `commonTest`) and a thin `androidApp` module, using the `audio-stream-poc` toolchain (Kotlin 2.3.21, AGP 8.13.2, Gradle 8.14.3, JDK 17, compileSdk 36, minSdk 26).

#### Scenario: Shared logic is deviceless-testable
- **WHEN** pipeline, segmentation, ASR/translation, and config logic are implemented
- **THEN** they SHALL live in `commonMain` and be exercised by `commonTest` without an Android device

#### Scenario: iOS-ready seams
- **WHEN** a platform capability is needed (capture, HTTP, VAD)
- **THEN** it SHALL sit behind an `expect/actual` or interface seam so an `iosMain` actual can be added later without changing `commonMain`

### Requirement: Foreground service for screen-off recording
The system SHALL run the pipeline inside an Android foreground service of type `microphone` with a persistent notification, so recording continues with the screen off.

#### Scenario: Start service while visible
- **WHEN** the user starts recording while the app is visible
- **THEN** the system SHALL start the `microphone` foreground service (satisfying the Android 14+ restriction) and run the pipeline scope within it

#### Scenario: Stop from notification
- **WHEN** the user taps the notification's Stop action
- **THEN** the system SHALL stop the pipeline and the foreground service

### Requirement: Settings persistence
The system SHALL persist user configuration via DataStore: ASR base URL/key/model/language hint, LLM base URL/key/model, and two preferred languages.

#### Scenario: Restore settings on relaunch
- **WHEN** the app is reopened after configuration
- **THEN** the system SHALL restore all saved settings

#### Scenario: First-launch routing
- **WHEN** the app launches and the ASR server is not configured
- **THEN** the system SHALL route the user to settings and disable the record control

### Requirement: Jetpack Compose UI rendering a single state
The system SHALL render the UI in Jetpack Compose from the pipeline's single `StateFlow<UiState>`: a transcript list (speaker, text, language badge), an interim line, dual-translation display per segment, a record/stop control, a speech indicator, auto-scroll, and an error surface.

#### Scenario: Render from state snapshots
- **WHEN** the pipeline emits a new `UiState`
- **THEN** Compose SHALL recompose from the immutable snapshot without the UI thread performing audio, VAD, or HTTP work

#### Scenario: Consecutive-failure warning
- **WHEN** 3 consecutive pipeline failures occur
- **THEN** the system SHALL show a persistent warning in addition to the non-blocking per-error message

### Requirement: Two-tier testing
The system SHALL be verified with two tiers matching the `audio-stream-poc`: Tier-1 programmatic/deviceless tests, and Tier-2 manual sensory sign-off.

#### Scenario: Tier-1 unit tests
- **WHEN** the test suite runs in CI
- **THEN** `commonTest` SHALL cover `Segmenter` (boundaries/min/max/interim/flush via a fake detector), `AutoGain`, language normalization, translation-target selection, `WavEncoder`, `PcmFramer`, and `SpeechGate`

#### Scenario: Tier-1 automated inject-WAV E2E
- **WHEN** the automated E2E runs
- **THEN** a known speech WAV SHALL be fed through the pipeline with ASR pointed at a local mock server returning fixed text, and the resulting segments and translations SHALL be asserted exactly, printing PASS/FAIL

#### Scenario: Tier-2 manual sign-off
- **WHEN** the user runs the debug build on a real device
- **THEN** speaking SHALL produce interim then final segments and dual translations, screen-off recording SHALL continue, and repeated start/stop/background SHALL not crash or leave stuck state

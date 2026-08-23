## ADDED Requirements

### Requirement: Flutter project structure
The system SHALL be a Flutter project located at `flutter/` in the repository root, targeting Android (API 29+) and iOS (14.0+). The project SHALL use the standard Flutter directory layout with services, screens, models, and widgets directories under `lib/`.

#### Scenario: Build Android APK
- **WHEN** `flutter build apk` is run in the `flutter/` directory
- **THEN** the system SHALL produce a working Android APK that can be installed on Android 10+ devices

#### Scenario: Build iOS (future)
- **WHEN** `flutter build ios` is run
- **THEN** the system SHALL produce an iOS build targeting iOS 14.0+

### Requirement: Home screen with transcript display
The system SHALL display a home screen with a scrollable transcript area and recording controls. The transcript SHALL show finalized segments with speaker label, text, and optional translation. Interim (partial) text SHALL be displayed as updating text below the last finalized segment.

#### Scenario: Display finalized segment
- **WHEN** the pipeline emits a segment event
- **THEN** the system SHALL append a new entry to the transcript list showing the speaker label ("You"), the transcribed text, and the detected language

#### Scenario: Display interim text
- **WHEN** the pipeline emits an interim event
- **THEN** the system SHALL update the interim text area below the transcript list, replacing any previous interim text

#### Scenario: Display translation
- **WHEN** the pipeline emits a translation event for a segment
- **THEN** the system SHALL display the translated text below the corresponding segment, labeled with the target language

#### Scenario: Auto-scroll on new content
- **WHEN** a new segment or translation is added to the transcript
- **THEN** the transcript view SHALL auto-scroll to show the latest content, unless the user has manually scrolled up

### Requirement: Recording controls
The system SHALL provide a record/stop toggle button on the home screen. The button state SHALL reflect whether recording is active.

#### Scenario: Start recording
- **WHEN** the user taps the record button and the app is properly configured (ASR server URL set)
- **THEN** the system SHALL start the pipeline (foreground service + audio capture + VAD + transcription)

#### Scenario: Stop recording
- **WHEN** the user taps the stop button while recording is active
- **THEN** the system SHALL stop the pipeline and foreground service

#### Scenario: Record button disabled without configuration
- **WHEN** the ASR server URL is not configured
- **THEN** the record button SHALL be disabled and the system SHALL display a prompt to configure settings

### Requirement: Settings screen
The system SHALL provide a settings screen for configuring remote API endpoints and language preferences. Settings SHALL be persisted locally using `shared_preferences`.

#### Scenario: Configure ASR server
- **WHEN** the user enters an ASR server URL, optional API key, and model name in settings
- **THEN** the system SHALL save these values locally and use them for all subsequent ASR requests

#### Scenario: Test ASR connection
- **WHEN** the user taps "Test Connection" for the ASR server
- **THEN** the system SHALL call `GET {url}/v1/models` and display success (with available models) or failure with error message

#### Scenario: Configure LLM server for translation
- **WHEN** the user enters an LLM API base URL, optional API key, and model name
- **THEN** the system SHALL save these values and use them for translation requests

#### Scenario: Configure preferred languages
- **WHEN** the user selects a preferred language and optionally a secondary preferred language
- **THEN** the system SHALL save the language preferences and use them to determine when translation is needed

#### Scenario: Configure ASR language hint
- **WHEN** the user selects a specific ASR language or leaves it as "Auto-detect"
- **THEN** the system SHALL include or omit the `language` field in ASR requests accordingly

### Requirement: Error display
The system SHALL display pipeline errors (ASR failures, network errors) as non-blocking toast notifications or snackbar messages. Errors SHALL NOT interrupt the recording session.

#### Scenario: Network error during transcription
- **WHEN** an ASR or translation HTTP request fails
- **THEN** the system SHALL display a brief error message via snackbar and continue the recording session

#### Scenario: Multiple consecutive errors
- **WHEN** ASR requests fail 3 or more times consecutively
- **THEN** the system SHALL display a persistent warning indicating connection issues, while continuing to attempt transcription

### Requirement: App configuration persistence
The system SHALL persist all user settings (ASR server, LLM server, language preferences) locally using `shared_preferences`. Settings SHALL survive app restarts and reinstalls (via Android auto-backup).

#### Scenario: Settings survive app restart
- **WHEN** the user configures settings and restarts the app
- **THEN** all previously saved settings SHALL be restored

#### Scenario: First launch defaults
- **WHEN** the app launches with no saved settings
- **THEN** the system SHALL use defaults: preferred language "en", no secondary language, empty ASR/LLM configuration, ASR language auto-detect

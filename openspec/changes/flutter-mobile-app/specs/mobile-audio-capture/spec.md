## ADDED Requirements

### Requirement: Microphone audio capture via record package
The system SHALL capture audio from the device microphone using the Flutter `record` package's `startStream()` method, producing a `Stream<Uint8List>` of raw PCM16 audio at 16kHz sample rate, mono channel.

#### Scenario: Start microphone capture
- **WHEN** the user taps the record button
- **THEN** the system SHALL request microphone permission (if not granted), configure the `record` package for PCM16 at 16kHz mono, call `startStream()`, and begin emitting audio chunks to the VAD service

#### Scenario: Microphone permission denied
- **WHEN** the user denies microphone permission
- **THEN** the system SHALL display an error message explaining that microphone access is required and provide a link to app settings

#### Scenario: Stop microphone capture
- **WHEN** the user taps the stop button
- **THEN** the system SHALL call `stop()` on the recorder, closing the PCM stream and flushing any remaining audio to the VAD service

### Requirement: Android foreground service for background recording
The system SHALL use `flutter_foreground_task` with foreground service type `microphone` to maintain audio capture when the app is backgrounded or the screen is off on Android.

#### Scenario: Start foreground service before backgrounding
- **WHEN** the user starts recording
- **THEN** the system SHALL start a foreground service with type `microphone` displaying a persistent notification indicating active recording, before beginning audio capture

#### Scenario: Continue recording with screen off
- **WHEN** the screen turns off or the user switches to another app while recording is active
- **THEN** the audio capture, VAD processing, and HTTP transcription calls SHALL continue uninterrupted in the foreground service's Dart isolate

#### Scenario: Stop recording stops foreground service
- **WHEN** the user stops recording (via the app UI or the notification action)
- **THEN** the system SHALL stop audio capture, the pipeline, and the foreground service, removing the persistent notification

#### Scenario: Foreground service must start while app is visible
- **WHEN** the app attempts to start a foreground service
- **THEN** the system SHALL only start the service while an activity is in the foreground, as required by Android 14+

### Requirement: Android permissions
The system SHALL declare and request the following Android permissions: `RECORD_AUDIO` (runtime), `FOREGROUND_SERVICE` (manifest), `FOREGROUND_SERVICE_MICROPHONE` (manifest), and `WAKE_LOCK` (manifest).

#### Scenario: Runtime permission request on first recording
- **WHEN** the user taps record for the first time and `RECORD_AUDIO` permission has not been granted
- **THEN** the system SHALL display the Android runtime permission dialog for microphone access

#### Scenario: Permission permanently denied
- **WHEN** the user has permanently denied microphone permission (checked "Don't ask again")
- **THEN** the system SHALL display a message directing the user to enable the permission in system settings

### Requirement: iOS foreground-only audio capture
On iOS, the system SHALL capture microphone audio only while the app is in the foreground. The system SHALL NOT attempt background audio recording on iOS in v1.

#### Scenario: App backgrounded on iOS during recording
- **WHEN** the user switches away from the app on iOS while recording
- **THEN** the system SHALL pause audio capture and display a notification or visual indicator that recording is paused

#### Scenario: App foregrounded on iOS after pause
- **WHEN** the user returns to the app on iOS after it was backgrounded during recording
- **THEN** the system SHALL resume audio capture automatically

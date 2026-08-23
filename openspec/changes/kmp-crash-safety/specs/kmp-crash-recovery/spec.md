# kmp-crash-recovery Spec

## ADDED Requirements

### Requirement: Recording never auto-resumes after process death
The foreground recording service SHALL NOT restart capture when the system revives it after the process was killed or crashed. The service SHALL run as `START_NOT_STICKY`, and a start with a null intent (system revival) SHALL shut the service down without starting the pipeline or posting a persistent notification.

#### Scenario: App crashes while recording
- **WHEN** the process dies while a recording session is active and the user later reopens the app
- **THEN** the app is idle (no recording, no microphone use, no "Listening…" notification) and the previously persisted transcript is still resumable

#### Scenario: System revives the service
- **WHEN** Android restarts the transcribe service with a null intent
- **THEN** the service stops itself without invoking pipeline start and without remaining in the foreground

### Requirement: Pipeline failures degrade to an error, not a crash
Any exception escaping the recording pipeline (audio capture, VAD, segmentation, or channel plumbing) SHALL stop the session cleanly: capture and detector resources are released, the pipeline transitions to idle with an error message in the UI state, and the process stays alive. The app-container coroutine scope SHALL install a `CoroutineExceptionHandler` that logs and prevents process death for anything still unhandled.

#### Scenario: Microphone becomes unavailable mid-session
- **WHEN** audio capture throws while recording (e.g. another app takes the microphone or `AudioRecord` fails)
- **THEN** recording stops, the UI shows an error naming the failure, the transcript so far is kept, and the user can start a new recording immediately

#### Scenario: VAD inference fails
- **WHEN** the voice-activity detector throws during frame processing
- **THEN** the session ends with an on-screen error instead of the process being killed

### Requirement: Service lifecycle mirrors pipeline state
The foreground service and its notification SHALL exist only while the pipeline is actually recording. When the pipeline leaves the recording state for any reason other than a user stop through the service (runtime error, failed start such as the unsupported-sample-rate guard), the service SHALL stop the foreground state, remove the notification, and stop itself.

#### Scenario: Pipeline start is rejected
- **WHEN** the service starts but the pipeline refuses to start (e.g. the microphone only supports 44.1 kHz)
- **THEN** the "Listening…" notification is removed and the service stops, while the UI shows the error

#### Scenario: Pipeline dies from a runtime error
- **WHEN** an in-session failure transitions the pipeline to idle with an error
- **THEN** the notification disappears and the microphone-in-use indicator turns off without user action

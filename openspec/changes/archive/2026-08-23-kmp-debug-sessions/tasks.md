# Tasks — KMP Debug Sessions

## 1. Shared tracing core (commonMain)

- [x] 1.1 Add `Tracer` interface + `NoopTracer` (startSession/endSession/emit/saveWav/onAudioChunk) in `shared/commonMain`
- [x] 1.2 Wire trace hooks into `PipelineController`: session start/end, capture error, VAD transitions, segment, ASR call/done/error (final + interim kind, latency), translate call/done/error; feed `onAudioChunk` from the collect loop; accept injectable `TimeSource`
- [x] 1.3 Add heartbeat 1s ticker (chunks since last beat, RMS, VAD state, in-flight ASR/translation counts, seconds since last interim/final) and stall watchdog (10s unanswered speech, 30s refire cap) in `PipelineController`
- [x] 1.4 commonTest: `RecordingTracer` fake; tests for event sequence of a transcribed segment, ASR error event, heartbeat contents, watchdog fires on hung ASR, watchdog silent during silence

## 2. Android tracer + storage (androidApp)

- [x] 2.1 `FileTracer`: session dir creation (`filesDir/sessions/<ts>/`), JSONL serialization of type+fields with wall-clock and elapsed timestamps, channel + IO-dispatcher buffered writer flushed ~1s and on endSession
- [x] 2.2 `FileTracer` audio: `saveWav` for final ASR inputs (reuse `WavEncoder`), 60s ring buffer in `onAudioChunk`, ring dump on stall — all gated on `debugAudio`
- [x] 2.3 Daily cleanup: `ensureDailyCleanup()` deleting non-today session dirs, last-cleanup epoch-day persisted in Preferences DataStore; call from `FileTracer.startSession` and debug screen entry
- [x] 2.4 `debugAudio` setting: `AppConfig` field, `SettingsStore` key, `SettingsScreen` toggle under a Debugging section; `AppContainer` wires `FileTracer` into `PipelineController` and updates its config

## 3. Debug sessions UI (androidApp)

- [x] 3.1 Session listing: parse session dirs off-main (metadata: start, duration, event count, error/stall counts, size); `DebugSessionsScreen` list newest-first with badges + total storage used; entry button in Settings, navigation state in `AppRoot`
- [x] 3.2 Session detail: chronological important-event list (interims collapsed to count, heartbeats to one summary line), expandable raw JSON rows, event-type chips
- [x] 3.3 WAV playback: inline play button on events with `wav` field via `MediaPlayer`, single active playback

## 4. Export/share

- [x] 4.1 `FileProvider` manifest entry + `res/xml/file_paths.xml` for `cacheDir/exports/`
- [x] 4.2 Share action on session row: zip session dir to `cacheDir/exports/<name>.zip` off-main, fire `ACTION_SEND` with content URI

## 5. Verify

- [x] 5.1 Run shared tests (`./gradlew :shared:testDebugUnitTest` or equivalent) and ensure androidApp assembles (`./gradlew :androidApp:assembleDebug`)

## 6. Device-review improvements

- [x] 6.1 Show interim `asr_error` events in session detail (only interim call/done stay collapsed)
- [x] 6.2 Offer WAV playback only when the file exists on disk
- [x] 6.3 Trace final transcript text in `asr_done` and show it in the event summary
- [x] 6.4 Show absolute wall-clock time (HH:mm:ss) in event rows instead of elapsed seconds
- [x] 6.5 "Delete all debug audio" action with size + confirmation; keeps trace logs

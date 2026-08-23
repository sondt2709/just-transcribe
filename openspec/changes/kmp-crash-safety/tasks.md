# Tasks: kmp-crash-safety

## 1. Pipeline failure containment (shared)

- [x] 1.1 Add a `PipelineStatus`-visible failure path in `PipelineController.start()`: wrap the collect block in `try/catch (Throwable)` (rethrow `CancellationException`), tear down segmenter/detector, emit a `pipeline_error` trace event, and land on `Idle` with `error` set
- [x] 1.2 Unit-test the failure path with a throwing `audioSource` flow and a throwing detector: state ends `Idle` + error, no exception escapes the job
- [x] 1.3 Guard `TranslationClient.recent` with a kotlinx `Mutex`: mutation + context snapshot inside `withLock`, HTTP calls outside; unit-test concurrent `translate()` calls for no loss and ordered context

## 2. Service lifecycle (android)

- [x] 2.1 `TranscribeService`: return `START_NOT_STICKY`; on `intent == null` do `stopForeground(STOP_FOREGROUND_REMOVE)` + `stopSelf()` without touching the container
- [x] 2.2 Add a service-scoped collector on `container.state`: stop foreground + self when status leaves `Recording`, or when the first observed status after start is `Idle` with an error (rejected start)
- [x] 2.3 Install a logging `CoroutineExceptionHandler` on `AppContainer.scope`

## 3. Verification

- [x] 3.1 Run shared unit tests (`./gradlew :shared:testDebugUnitTest` or equivalent) — all green
- [ ] 3.2 Build debug APK; manual matrix on device: kill app mid-recording → reopen shows idle + no notification; revoke mic mid-recording (or trigger capture failure) → error banner, notification gone, app alive

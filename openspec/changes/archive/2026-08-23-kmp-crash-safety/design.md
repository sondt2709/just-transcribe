# Design: kmp-crash-safety

## Context

`TranscribeService` returns `START_STICKY`, so after a process crash Android revives the service with a null intent, which today falls into the default branch (`startInForeground()` + `container.requestStart()`) — recording resumes without user intent, and on Android 12+ the revived mic FGS gets silenced input. `PipelineController.start()` launches the capture job with `try { collect } finally { … }` — no catch — on `AppContainer.scope` (`SupervisorJob + Dispatchers.Default`, no `CoroutineExceptionHandler`), so any throw from `AudioRecord` init, VAD/ONNX inference, or channel plumbing kills the process. The service never observes pipeline state: an error or a rejected start (`emitError` on the 44.1 kHz guard) leaves a foreground "Listening…" notification over a dead pipeline. `TranslationClient.recent` (`ArrayDeque`) is mutated by concurrent `translate()` calls launched per segment.

## Goals / Non-Goals

**Goals:**
- No recording session ever starts without a user action.
- No pipeline failure kills the process; every failure lands in `UiState.error` with the pipeline back at `Idle`.
- The foreground service + notification exist exactly while `PipelineStatus.Recording`/`Stopping`.
- `TranslationClient` context deque safe under concurrency.

**Non-Goals:**
- Auto-stop after N consecutive ASR failures (explicitly dropped by the user).
- Crash reporting/analytics integration.
- Desktop or Flutter changes.

## Decisions

- **`START_NOT_STICKY` + null-intent shutdown** over handling revival gracefully: a mic capture app must never self-resume; on `intent == null` the service calls `stopForeground(STOP_FOREGROUND_REMOVE)` + `stopSelf()` before touching the container. Simpler and safer than re-attaching to state.
- **Catch inside the pipeline job**, not only a scope-level handler: wrap the collect block in `try/catch (e: Throwable)` (rethrow `CancellationException`), then run the same teardown as `stop()` (flush skipped — the source is broken), set `status = Idle` with `error = message`, emit a `pipeline_error` trace event. The scope-level `CoroutineExceptionHandler` stays as a net for other launches (persistLoop, translation launches already guarded) and only logs — state repair belongs to the pipeline.
- **Service observes `container.state`**: in `onStartCommand` start-branch, launch a service-scoped collector on `state.status`; when status becomes `Idle` (error or rejected start) while the service is foreground → `stopForeground` + `stopSelf`. This single mechanism covers the 44.1 kHz guard, runtime errors, and normal stop via the notification action. Alternative — explicit callbacks from container to service — rejected: state observation reuses the existing single source of truth.
- **Start-rejection signaling**: `requestStart()` currently `emitError`s and returns; with the state collector in place the service sees status still `Idle` after start. To avoid racing "not yet Recording" vs "failed", the collector reacts only to transitions *out of* Recording, plus an initial check: if status is not Recording within a short grace (first emission after `requestStart` returns without Recording), stop. Simplest robust form: collect `state.status`, `drop` nothing, stop the service when a non-Recording status is observed after a Recording one, or when the first status seen is Idle with a non-null error.
- **`Mutex` around `recent` in `TranslationClient`** (kotlinx `Mutex`, suspend-friendly) over `synchronized`: `translate()` is a suspend path; mutation + snapshot happen inside `mutex.withLock`, network calls stay outside the lock.

## Risks / Trade-offs

- [Service state-collector races the pipeline's first emission] → react to transitions and to `Idle`+`error`, not to the mere initial `Idle`; unit-test the controller transitions, manually test the 44.1 kHz guard path.
- [`START_NOT_STICKY` means a system-killed (not crashed) recording session does not resume] → acceptable: silent resume is worse than requiring a tap; transcript is persisted continuously.
- [Catching `Throwable` can mask programming errors] → the catch rethrows `CancellationException` and traces the exception message + type into the session trace for the debug viewer.

## Open Questions

- None — behavior fully specified by the two specs.

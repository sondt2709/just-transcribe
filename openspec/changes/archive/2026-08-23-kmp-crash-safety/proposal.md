# Proposal: kmp-crash-safety

## Why

The KMP Android app can die on runtime failures the pipeline does not guard (mic taken by another app, VAD/ONNX errors escape the recording coroutine, which has no top-level catch and no `CoroutineExceptionHandler`), and after a crash the `START_STICKY` foreground service is revived by the system and silently resumes "recording" — the user reopens the app and finds it recording without having asked (on Android 12+ with silenced mic input, so it captures nothing while claiming to listen).

## What Changes

- `TranscribeService` no longer auto-resumes after process death: `START_NOT_STICKY`, and a system-revived start (null intent) shuts the service down instead of starting capture.
- The recording pipeline catches all failures: any exception escaping the capture/VAD/segmentation loop stops recording cleanly and surfaces an error banner instead of killing the process; the app-container scope gets a `CoroutineExceptionHandler` as a last-resort net.
- The foreground service lifecycle follows the pipeline state: when the pipeline leaves the recording state (error, failed start, 44.1 kHz mic guard), the service stops itself and removes the "Listening…" notification — no zombie notification over a dead pipeline.
- `TranslationClient`'s shared context deque is made safe under concurrent `translate()` calls (today a race can silently drop a segment's translations and corrupt the LLM context window).

## Capabilities

### New Capabilities

- `kmp-crash-recovery`: Recording never resumes on its own after a crash; runtime pipeline failures degrade to an on-screen error with the app alive; the foreground service and its notification exist only while the pipeline is actually recording.
- `kmp-translation-consistency`: Concurrent segment translations never lose results or corrupt the shared conversation context.

### Modified Capabilities

<!-- none — existing specs cover the desktop app; KMP behavior is introduced as new capabilities -->

## Impact

- `kmp/androidApp/.../TranscribeService.kt` — sticky policy, null-intent handling, pipeline-state observation.
- `kmp/shared/.../PipelineController.kt` — top-level catch in the recording job, error status transition.
- `kmp/androidApp/.../JustTranscribeApp.kt` (AppContainer) — `CoroutineExceptionHandler` on the scope; start-failure signaling.
- `kmp/shared/.../TranslationClient.kt` — synchronized context deque.
- No impact on the desktop Electron/Python app or the Flutter prototype.

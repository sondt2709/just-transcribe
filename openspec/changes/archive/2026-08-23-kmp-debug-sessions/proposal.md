# KMP Debug Sessions

## Why

The Android (KMP) app has zero diagnostics: no logging, no trace of pipeline decisions, and errors surface only as a transient `UiState.error` string. The same silent-failure mode fixed on desktop (hung remote ASR call → pipeline goes quiet with no signal) exists here with no way to diagnose it. Desktop got pipeline tracing + a trace viewer (archived changes `2026-08-20-pipeline-tracing-stall-fixes`, `2026-08-20-trace-viewer-ui`); the phone needs the equivalent, adapted to Android storage/export constraints.

## What Changes

- **Pipeline tracing (always on)**: a `Tracer` seam in `shared/commonMain` with a no-op default; pipeline stages emit structured events. Android `FileTracer` writes JSONL per recording session to app-internal storage (`filesDir/sessions/<timestamp>/events.jsonl`). Events tailored to the Android pipeline (not a copy of desktop's): audio capture start/stop/chunk stats, VAD speech start/end, segment finalized/dropped, ASR calls (interim/final, duration, latency, result or error), translation (LLM) calls (latency, status), pipeline errors.
- **Heartbeat**: 1/s snapshot event while recording: chunks received since last beat, RMS, VAD in-speech state, in-flight ASR/translation counts, seconds since last interim/final.
- **Stall watchdog**: audio flowing + unanswered speech for 10s with no interim/final output → `stall` trace event with stage snapshot; fires at most once per 30s.
- **Opt-in audio debug recording**: new setting `debugAudio` (default off). When on, the exact samples of each final ASR call are saved as WAV in the session dir (reuses existing `WavEncoder`), plus a rolling 60s ring buffer dumped to WAV when the stall watchdog fires.
- **Debug sessions screen (Compose)**: entry from Settings. Session list (newest first, event/error/stall counts, size); session detail showing important events as a simple chronological list (mic, VAD, segment, ASR, LLM, stall, error — heartbeats summarized, not listed; no filter UI); inline playback of session WAVs.
- **Export/share**: zip a session directory and share via `FileProvider` + `ACTION_SEND` share sheet (no storage permissions). JSONL schema mirrors desktop conventions so exported sessions are inspectable with existing desktop tooling/jq.
- **Automatic daily cleanup (no manual cleanup UI)**: on first access of each day (tracked via DataStore, Android best practice for small persisted state), sessions from previous days are deleted. All of today's sessions are kept. Debug screen shows current storage used.

## Capabilities

### New Capabilities
- `kmp-pipeline-tracing`: always-on structured JSONL session trace, heartbeat, stall watchdog, opt-in audio debug recording for the KMP Android app.
- `kmp-debug-sessions-ui`: in-app debug sessions screen (list, event view, audio playback), export/share, automatic daily retention.

### Modified Capabilities

<!-- none — desktop specs unaffected; KMP capabilities are new -->

## Impact

- `kmp/shared/src/commonMain`: new `Tracer` interface + event types; trace hooks in `PipelineController`, `Segmenter` (or via controller), `AsrClient`, `TranslationClient`; heartbeat + stall watchdog in `PipelineController`.
- `kmp/shared/src/commonTest`: tests for watchdog/heartbeat logic against fake tracer.
- `kmp/androidApp`: new `FileTracer` (JSONL writer, session dirs, WAV dumps), `DebugSessionsScreen` + session detail composables, zip+share via `FileProvider` (manifest entry + `file_paths.xml`), daily cleanup with DataStore-persisted last-cleanup day, `debugAudio` setting in `SettingsStore`/`SettingsScreen`, wiring in `AppContainer`.
- No impact on desktop app, Python backend, or release pipeline (kmp is not part of released macOS app).

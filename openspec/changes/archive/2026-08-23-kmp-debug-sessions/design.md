# Design — KMP Debug Sessions

## Context

The KMP Android app (`kmp/`) has a clean layered pipeline: `PipelineController` (commonMain) orchestrates capture → `Segmenter`/VAD → `AsrClient` → `TranslationClient`, reducing everything into one `UiState` StateFlow. There is no logging of any kind. Desktop already solved the equivalent problem (specs `pipeline-tracing`, `trace-viewer`) with JSONL session traces + a viewer; this change ports the idea, not the implementation — Android has no backend process, no HTTP API, and different storage/export conventions.

Constraints:
- commonMain must stay platform-free (no `java.io`, no `System.currentTimeMillis` in shared logic beyond what Kotlin stdlib offers) and testable against fakes.
- Trace writing must never block or slow the audio path.
- Phone storage is precious: retention must be automatic, no manual session cleanup UI (user decision). Debug WAVs are the one exception: they dominate storage, so a "delete all debug audio" action (confirmation-gated, logs kept) exists on the debug screen.

## Goals / Non-Goals

**Goals:**
- Always-on structured JSONL trace per recording session, on-device.
- Heartbeat + stall watchdog ported from desktop (single-source, simplified).
- Opt-in WAV capture of final ASR inputs + 60s ring dump on stall.
- In-app viewer: session list → chronological important-event list, WAV playback. No filter UI.
- Export/share a session as a zip via the Android share sheet.
- Automatic daily retention: first access each day deletes prior days' sessions; today's are all kept. Plus a manual "delete all debug audio" action (WAVs only, logs kept).

**Non-Goals:**
- No desktop/iOS viewer changes; no changes to Python/Electron code or desktop specs.
- No event filtering/search UI, no manual cleanup UI.
- No parity with desktop's multi-source events (mic gating, dedup, WS broadcast — don't exist on Android).
- No crash reporting / analytics — this is pipeline diagnostics only.

## Decisions

### 1. `Tracer` seam in commonMain, file I/O in androidApp

`shared/commonMain` gets a small interface; pipeline code calls it unconditionally (always-on), with a `NoopTracer` default so tests and iOS keep working:

```kotlin
interface Tracer {
    fun startSession()
    fun endSession()
    fun emit(type: String, fields: Map<String, Any?> = emptyMap())
    /** Save WAV if audio debug enabled; returns relative filename or null. */
    fun saveWav(label: String, samples: FloatArray): String?
    /** Feed raw capture for the stall ring buffer (no-op unless audio debug on). */
    fun onAudioChunk(samples: FloatArray)
}
```

- Timestamps are stamped by the tracer implementation at `emit` time (wall clock + monotonic elapsed), so commonMain needs no clock dependency; events carry stream-relative times in their fields where relevant.
- `fields` is a plain map of primitives; `FileTracer` (androidApp) serializes to one JSON object per line. Rationale: avoids a sealed event hierarchy that would churn every time an event is added; desktop uses the same "type + fields" JSONL shape, keeping exports jq-compatible.
- Alternative considered: expect/actual file tracer in shared. Rejected — only Android needs it now; the interface keeps commonTest trivially fake-able (`RecordingTracer`).

### 2. Trace hooks live in `PipelineController` (clients untouched)

The controller already sees every transition: VAD state flips, segment emission, ASR calls (final + interim), translation dispatch, errors. Hooks wrap existing call sites and measure latency around `asr.transcribe(...)` / `translator.translate(...)`. `AsrClient`/`TranslationClient` stay unchanged; error detail comes from the thrown exception message (already includes HTTP status).

Event vocabulary (Android-specific, deliberately smaller than desktop):

| type | key fields |
|---|---|
| `session_start` / `session_end` | config snapshot (URLs host-only, model names — never API keys) |
| `capture_error` | message (e.g. unsupported sample rate) |
| `vad_speech_start` / `vad_speech_end` | stream time, segment duration |
| `segment` | id, start, end, duration, wav (if debug audio) |
| `asr_call` / `asr_done` / `asr_error` | kind interim/final, audio duration, latency ms, text length, lang / error message |
| `translate_call` / `translate_done` / `translate_error` | segment id, latency ms, result count / error |
| `heartbeat` | see §3 |
| `stall` | snapshot + ring wav names (if debug audio) |

### 3. Heartbeat + watchdog: one 1s ticker inside the pipeline job

A single `launch`ed loop (sibling of `interimLoop`) ticks every second and:
- emits `heartbeat`: chunks received since last beat, last-chunk RMS, `seg.isSpeaking`, in-flight ASR/translation counts, seconds since last interim / last final;
- runs the watchdog check: unanswered speech (speech started, no interim or final since it started) for ≥10s while chunks are flowing → emit `stall` (with the same snapshot) + `tracer` ring dump; at most once per 30s.

Counters (chunk count, RMS, last-output timestamps) are fields on the controller updated in the collect loop / handlers — same thread-confinement model the controller already uses. Watchdog clock uses `kotlin.time.TimeSource.Monotonic` (available in commonMain, test-controllable by injecting a `TimeSource`).

### 4. Storage layout + `FileTracer` writing model

```
filesDir/sessions/<yyyy-MM-dd_HH-mm-ss>/
  events.jsonl
  seg_003.wav          (opt-in, final ASR input)
  stall_ring_1.wav     (opt-in, dumped on stall)
```

- `FileTracer` owns a `Channel<String>` drained by a writer coroutine on `Dispatchers.IO` with a `BufferedWriter`, flushed every ~1s and on `endSession`. `emit` just formats + sends — audio path never touches disk.
- App-internal `filesDir` (not `cacheDir`): survives until our own daily cleanup, no permissions, wiped on uninstall. `cacheDir` rejected — OS could reclaim a session before the user exports it.
- Ring buffer: fixed 60s FloatArray ring inside `FileTracer.onAudioChunk`, active only when `debugAudio` is on (~3.8 MB heap; acceptable, opt-in).

### 5. Daily cleanup — first access of the day, DataStore-persisted

- `SessionStore` (androidApp) exposes `ensureDailyCleanup()`: reads `last_cleanup_day` (epoch-day `Int`) from the existing Preferences DataStore; if != today, deletes every session dir whose name's date prefix != today, then writes today's epoch-day.
- Called from the two entry points that touch session storage: `FileTracer.startSession()` and the debug screen's first composition. Idempotent and cheap after the first call of the day.
- DataStore chosen over `SharedPreferences` per Android guidance and because the app already uses Preferences DataStore (`SettingsStore`).
- Retention = "today only". No size cap needed: JSONL is KB-scale and audio is opt-in; a day's worth is bounded in practice by recording time.

### 6. Viewer: two Compose screens, no filters

- Navigation stays in the existing `AppRoot` boolean-state style: add a `showDebug` state; entry button in `SettingsScreen` ("Debug sessions").
- **List**: session dirs newest-first; per row: start time, duration (last event − first), event count, error/stall badges, size. Parsed lazily off the main thread.
- **Detail**: chronological list of important events only — `session_*`, `vad_*`, `segment`, `asr_call/done/error` (finals; interims collapsed to a count), `translate_*`, `stall`, `capture_error`. Heartbeats are never listed; they surface as a one-line summary (count + max gap). Rows show time + type chip + one-line summary; tap expands raw JSON. Events with a `wav` field get an inline play button (`MediaPlayer`, one at a time).
- Rationale for no-filter/important-only: user decision; the full JSONL is always available via export for deep analysis with desktop tooling/jq.

### 7. Export via FileProvider + ACTION_SEND

- "Share" on a session row zips the session dir into `cacheDir/exports/<name>.zip` (java.util.zip, no new dependency), then fires `ACTION_SEND` with a `FileProvider` content URI (`<provider>` in manifest + `res/xml/file_paths.xml` exposing `cache/exports/`).
- Share sheet covers "export" in every sense (Drive, email, Nearby, Save to Files) with zero permissions. SAF `ACTION_CREATE_DOCUMENT` not added — share sheet already includes a save-to-Files target.
- Export zips stay in `cacheDir` so the OS reclaims them; also overwritten per session name.

### 8. Config: `debugAudio` in `AppConfig`

New `debugAudio: Boolean = false` field in `AppConfig`, persisted in `SettingsStore`, toggle in `SettingsScreen` under a "Debugging" section. `AppContainer` passes the flag into `FileTracer` via the existing `config.collect` update path.

## Risks / Trade-offs

- [Always-on tracing costs battery/IO] → JSONL only (few KB/min), buffered writes on IO dispatcher, flush 1/s; audio writing strictly opt-in.
- [Today-only retention loses yesterday's repro] → deliberate per user decision; mitigation is exporting the session same-day (share sheet is one tap from the list).
- [Tracer called from hot audio path] → `emit` is format+channel-send only; `onAudioChunk` is an array copy into a preallocated ring, only when `debugAudio` on.
- [`Map<String, Any?>` fields are stringly-typed] → contained: single `FileTracer` serializer; commonTest asserts event types/fields via `RecordingTracer`.
- [Watchdog false positives on slow-but-alive ASR] → same semantics as desktop spec: stall clock starts at unanswered speech onset, 30s refire cap; interim output resets it.
- [Zip of a session with debug audio could be tens of MB] → zip built on IO dispatcher with progress-free but async UI (row shows spinner); acceptable for a debug feature.

## Open Questions

None — viewer depth, retention policy, and watchdog/heartbeat scope were settled during exploration.

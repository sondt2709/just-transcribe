## Why

The Flutter mobile client (`flutter/`, change `flutter-mobile-app`) reached feature-complete but suffers from **crashes, UI freezes, and state-management glitches** (native ONNX crashes via `flutter_onnxruntime`, ad-hoc `StreamController`/`setState` wiring, start/stop races). The transcription pipeline itself (mic capture, VAD, remote ASR, translation) works — the instability lives in the Dart runtime seams and UI plumbing.

A native **Kotlin Multiplatform** Android app removes those bug classes structurally rather than by patching: a verified on-device Silero VAD library (no hand-driven ONNX session), structured-concurrency lifecycle, and a single unidirectional state model rendered by Jetpack Compose. The architecture is lifted from the proven `audio-stream-poc` KMP project (mic capture + on-device VAD, both verified end-to-end on a real device), and the product logic is ported from the Flutter app.

## What Changes

- **New Kotlin Multiplatform app** under `kmp/` (`shared` + `androidApp`), targeting Android (minSdk 26, compileSdk 36), reusing the `audio-stream-poc` skeleton and toolchain (Kotlin 2.3.21 / AGP 8.13.2 / JDK 17).
- **Feature parity with the Flutter app**: real-time mic transcription + translation, interim (partial) + final segments, on-device VAD gating, dual-language translation, configurable remote ASR/LLM endpoints, screen-off recording.
- **VAD**: reuse the POC's verified `VoiceActivityDetector` (gkonovalov/android-vad Silero, CPU) + `PcmFramer`; add a new pure-Kotlin **`Segmenter`** that turns the detector's per-frame booleans into discrete `SpeechSegment`s (2.0s silence boundary, 0.25s min, 30s max force-emit) and exposes in-progress audio for interim transcription.
- **Pipeline** ported from `pipeline_service.dart` as a coroutine-based orchestrator — but its 4× `StreamController` + manual interim-counter wiring is **replaced by a single `StateFlow<UiState>`** owned by a foreground-service-scoped pipeline.
- **Remote ASR** (multipart `POST /v1/audio/transcriptions`) and **remote translation** (`POST /v1/chat/completions`, dual-target + context window) re-expressed as **Ktor** clients.
- **Android foreground service** (type `microphone`) owns the pipeline coroutine scope for screen-off recording.
- **Jetpack Compose UI**: transcript list, interim line, dual-translation display, settings; **DataStore** for persistence.
- **Two testing tiers** matching the POC: Tier-1 deviceless `commonTest` unit tests + an automated inject-WAV E2E asserting transcripts against a local **mock ASR server**; Tier-2 manual sensory sign-off on a real device with screen off.
- **Copy the POC's KMP reference docs** (`docs/refs/`, design/plan docs) into this repo to build against offline.
- **No changes** to the Python backend, Electron app, or the remote API protocols. The Flutter app stays under `flutter/` as a fallback during the build and is **deleted in the final step** (the `flutter/` tree and the `flutter-mobile-app` change) once native parity + Tier-2 sign-off pass.

## Capabilities

### New Capabilities
- `mobile-audio-capture`: Microphone PCM capture in KMP via `AudioCapture` (AudioRecord, 16 kHz mono, 16 kHz-only when VAD is on), reused from the POC.
- `mobile-vad`: On-device voice activity detection reusing the POC's verified Silero detector + `PcmFramer`, plus a new pure-Kotlin `Segmenter` producing timed `SpeechSegment`s and interim audio with the same thresholds as the desktop/Flutter pipeline.
- `mobile-pipeline`: Coroutine orchestrator (capture → VAD → segment → remote ASR → remote translation), interim loop, and a single unidirectional `StateFlow<UiState>`; Ktor-based ASR and translation clients.
- `mobile-app-shell`: KMP project structure, Jetpack Compose UI, Android foreground service, DataStore settings, permissions, and the two-tier test harness.

### Removed Capabilities
- The Flutter implementation (`flutter/`) and the `flutter-mobile-app` change are **removed in the final step** (tasks §11), superseded by the KMP `mobile-*` capabilities above. The Flutter change's `mobile-*` delta specs were never synced into `openspec/specs/`, so removal is contained to the `flutter/` tree and that change folder.

## Impact

- **New codebase**: `kmp/` at project root (`shared/` KMP module + `androidApp/`), plus copied `docs/` reference bundle and an optional test-only mock ASR server.
- **Dependencies**: Kotlin Multiplatform, Ktor (client + content negotiation + OkHttp engine), kotlinx.serialization/coroutines, `gkonovalov/android-vad:silero` (JitPack), AndroidX (Activity, Lifecycle, Compose, DataStore).
- **Build/CI**: new Gradle build for an Android APK/AAB; no impact on Electron or Python builds.
- **Shared protocol**: identical remote endpoints (`/v1/audio/transcriptions`, `/v1/chat/completions`) — no server changes.
- **No breaking changes** to the desktop app or Python backend. The Flutter client is removed in the final step; mobile users migrate to the KMP app.

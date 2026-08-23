## Why

just-transcribe currently runs only on macOS via Electron. Users want real-time transcription and translation on mobile devices (Android first, iOS later). The mobile version will use remote APIs only (no local models), making the client lightweight. Flutter is chosen over CapacitorJS because existing Capacitor audio plugins cannot stream raw PCM — the core requirement for real-time VAD and transcription.

## What Changes

- **New Flutter mobile app** targeting Android (API 29+), with iOS support planned later
- Microphone audio capture with real-time PCM streaming via the `record` Flutter package
- On-device VAD using Silero VAD ONNX model (~1.5MB) — same model as desktop, different runtime
- Pipeline orchestrator ported to Dart: VAD loop, interim transcription (0.5s), final on silence, dedup logic
- Remote ASR via HTTP POST to OpenAI-compatible `/v1/audio/transcriptions` endpoint (same protocol as desktop)
- Remote translation via HTTP POST to OpenAI-compatible `/v1/chat/completions` endpoint (same protocol as desktop)
- Android foreground service (type: `microphone`) for screen-off recording via `flutter_foreground_task`
- Settings UI for configuring remote ASR server, LLM server, and language preferences
- **No system audio capture** — mobile is mic-only (no "speaker" source)
- **No local ASR/LLM models** — remote APIs only
- **No changes to the existing Python backend or Electron app**

## Capabilities

### New Capabilities
- `mobile-audio-capture`: Microphone capture on Android/iOS using Flutter `record` package with real-time PCM streaming, plus Android foreground service for background recording
- `mobile-vad`: On-device voice activity detection using Silero VAD ONNX model via `onnxruntime_flutter`, with the same threshold/timing parameters as the desktop pipeline
- `mobile-pipeline`: Dart port of the transcription pipeline orchestrator — VAD loop, interim/final transcription, remote ASR HTTP calls, remote translation HTTP calls
- `mobile-app-shell`: Flutter app structure, navigation, settings persistence, and Android-specific configuration (permissions, foreground service)

### Modified Capabilities
- None. The mobile app is a new standalone client consuming the same remote API protocols. No existing specs change.

## Impact

- **New codebase**: `flutter/` directory at project root with standard Flutter project structure
- **Dependencies**: Flutter SDK, `record` (audio), `flutter_foreground_task` (background), `onnxruntime_flutter` (VAD), `dio` or `http` (networking), `web_socket_channel` (optional, for future live server mode)
- **Build/CI**: New build pipeline for Android APK/AAB; no impact on existing Electron or Python builds
- **Shared protocol**: Mobile app uses the same HTTP endpoints (`/v1/audio/transcriptions`, `/v1/chat/completions`) as the desktop remote mode — no server changes needed
- **No breaking changes** to existing desktop app or Python backend

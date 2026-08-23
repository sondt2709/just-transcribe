## Context

just-transcribe is a macOS desktop app (Electron + Python backend) for real-time audio transcription and translation. The Python backend handles audio capture (mic via sounddevice, system audio via audiotee), VAD (Silero), ASR (local MLX or remote HTTP), and translation (remote LLM). The Electron frontend connects via HTTP/WebSocket to control the pipeline and display transcripts.

For mobile, the architecture changes fundamentally: there is no Python backend on-device. The mobile app is a self-contained Flutter client that captures audio, runs VAD locally, and calls remote ASR/LLM APIs directly via HTTP. The Python backend and Electron app are untouched.

## Goals / Non-Goals

**Goals:**
- Real-time mic transcription on Android with screen-off support
- On-device VAD using the same Silero model (ONNX runtime) for bandwidth efficiency
- Remote ASR and translation using the same OpenAI-compatible HTTP protocols as desktop
- Interim (partial) and final transcription display matching desktop UX
- User-configurable remote server endpoints and language preferences
- Clean separation so iOS support can be added later with minimal changes

**Non-Goals:**
- System audio capture (not feasible on mobile; mic-only)
- Local ASR or LLM models on device
- Speaker diarization or multi-source dedup (single mic source only)
- Electron or Python backend modifications
- iOS background recording (App Store policy risk; foreground-only on iOS initially)
- Offline transcription capability

## Decisions

### 1. Flutter over CapacitorJS

**Choice**: New Flutter codebase in `flutter/` directory.

**Rationale**: CapacitorJS would reuse ~80% of React UI code, but no existing Capacitor plugin exposes raw PCM audio streaming — the core requirement. The `record` Flutter package natively provides `Stream<Uint8List>` of PCM data, which is exactly what VAD needs. Building a custom native Capacitor plugin to bridge this gap would negate the code-reuse benefit.

**Alternatives considered**:
- CapacitorJS: High UI reuse but critical audio streaming gap requires custom native plugin
- React Native: `react-native-live-audio-stream` exists but unmaintained (last commit 2022-2023); JS bridge adds latency for high-frequency audio
- PWA: Cannot record with screen off on either platform — hard blocker

### 2. On-device VAD via Silero ONNX

**Choice**: Run Silero VAD on-device using ONNX Runtime, not on a remote server.

**Rationale**: Streaming raw audio to a server for VAD would require ~256kbps constant upload, drain battery, add latency, and fail without network. On-device VAD means we only send detected speech segments over HTTP (same as desktop), saving bandwidth and enabling the app to be silent when nobody is speaking.

**Implementation**: Silero publishes `silero_vad.onnx` (~1.5MB). Use `onnxruntime_flutter` to run inference. Port the 512-sample chunk processing logic from `vad.py` to Dart. Same thresholds (0.5 speech, 2.0s silence, 0.25s min speech).

**Alternatives considered**:
- Server-side VAD (stream all audio): High bandwidth, latency, battery drain
- WebRTC VAD: Lighter but less accurate; no ML model, just signal processing

### 3. Direct HTTP to remote APIs (no intermediary server)

**Choice**: Flutter app calls remote ASR and LLM APIs directly via HTTP.

**Rationale**: The desktop app's remote mode already uses standard OpenAI-compatible HTTP endpoints (`/v1/audio/transcriptions`, `/v1/chat/completions`). The mobile app can call these same endpoints directly — no need for a relay server. The Python backend's role in remote mode is just VAD + HTTP forwarding, both of which the mobile app handles natively.

```
Desktop:  Mic → Python(VAD → HTTP POST) → Remote ASR/LLM
Mobile:   Mic → Flutter(VAD → HTTP POST) → Remote ASR/LLM
                 ▲ same endpoints, same protocol
```

### 4. Android foreground service for screen-off recording

**Choice**: `flutter_foreground_task` with `microphone` service type.

**Rationale**: Android 14+ requires explicit foreground service type declarations for background mic access. `flutter_foreground_task` v9.x supports `ServiceType.microphone`, has a proven `record_service` example, and keeps a Dart isolate alive for the full pipeline (audio capture + VAD + HTTP calls).

**Constraints**: The foreground service must be started while the app is visible (Android 14+ restriction). A persistent notification is mandatory. On iOS, this approach doesn't work — iOS will be foreground-only initially.

### 5. Simplified orchestrator (mic-only, no half-duplex)

**Choice**: Port orchestrator logic but remove speaker-related code paths.

**Rationale**: Mobile has no system audio capture, so there's no "speaker" source. This eliminates: half-duplex mic suppression, cross-source dedup, and dual-stream management. The mobile orchestrator is simpler — single source, VAD → interim/final → ASR → translate.

### 6. Project structure

```
flutter/
├── android/              # Android-specific (manifest, permissions)
├── ios/                  # iOS-specific (Info.plist, entitlements)
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── models/           # Data classes (segment, config, etc.)
│   ├── services/
│   │   ├── audio_capture_service.dart    # record package wrapper
│   │   ├── vad_service.dart              # Silero ONNX inference
│   │   ├── asr_service.dart              # HTTP POST to remote ASR
│   │   ├── translation_service.dart      # HTTP POST to remote LLM
│   │   └── pipeline_service.dart         # Orchestrator (VAD→ASR→translate)
│   ├── screens/
│   │   ├── home_screen.dart              # Transcript display + controls
│   │   └── settings_screen.dart          # Server config, languages
│   └── widgets/          # Reusable UI components
├── assets/
│   └── silero_vad.onnx   # VAD model (~1.5MB)
├── pubspec.yaml
└── README.md
```

## Risks / Trade-offs

**[ONNX Runtime size]** `onnxruntime_flutter` adds ~15-25MB to APK size for the native library.
  -> Mitigation: Acceptable for an audio processing app. Use app bundles (AAB) so users download only their ABI.

**[record package background support]** The `record` package streams PCM in foreground; background behavior depends on the foreground service keeping the Dart isolate alive.
  -> Mitigation: `flutter_foreground_task` has a documented `record_service` example proving this works. Test early on Android 14+ devices.

**[Silero ONNX model parity]** The ONNX export may behave slightly differently from the PyTorch version used on desktop.
  -> Mitigation: Silero's ONNX model is their primary distribution format. Use the same thresholds and validate with the same test audio.

**[Android manufacturer battery optimization]** Some Android OEMs (Samsung, Xiaomi, Huawei) aggressively kill background services despite foreground service status.
  -> Mitigation: Document "disable battery optimization" in app settings. Consider using `flutter_foreground_task`'s auto-restart capability. Link to dontkillmyapp.com guidance.

**[iOS foreground-only limitation]** iOS cannot reliably record audio in background without App Store review risk.
  -> Mitigation: Explicitly scope iOS as foreground-only for v1. Background recording is a future enhancement pending App Store policy navigation.

**[No offline mode]** Remote-only means no transcription without network.
  -> Mitigation: Acceptable trade-off for v1. Show clear "no connection" state. On-device ASR (whisper.cpp ONNX) is a future possibility.

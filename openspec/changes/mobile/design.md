## Context

just-transcribe is a macOS desktop app (Electron + Python) with a remote-API mobile client. The first mobile client (`flutter/`) is feature-complete but unstable: the reported pain is **crashes, UI freezes, and state glitches**, not the pipeline itself. Two reference codebases inform this change:

- `flutter/` — the **product logic** we are porting (VAD thresholds, segment rules, ASR/translation HTTP, interim loop, dual translation, settings).
- `../audio-stream-poc` (KMP) — the **architecture skeleton**, verified end-to-end on a real device (OnePlus CPH2449, Android 16): mic capture (`AudioCapture`), Ktor transport, and an **on-device Silero VAD** stack (`VoiceActivityDetector`, `AndroidVoiceActivityDetector`, `PcmFramer`, `SpeechGate`, `VadGate`).

The native app is the **union**: the POC's verified skeleton + the Flutter app's ported logic, re-expressed in idiomatic Kotlin/Compose so the unstable Dart seams disappear.

## Goals / Non-Goals

**Goals:**
- Feature parity with the Flutter app: real-time mic transcription + translation, interim + final segments, dual-language translation, screen-off recording, configurable remote endpoints.
- Eliminate the crash/UI/state bug class by construction (verified VAD library, structured concurrency, single unidirectional state).
- Reuse the POC's verified VAD detector and capture rather than re-porting the ONNX session.
- Keep the `shared` module iOS-ready via `expect/actual` seams (iOS not built now).
- Two testing tiers matching the POC.
- Retire the Flutter client (`flutter/` + the `flutter-mobile-app` change) as the final step, once native parity + Tier-2 sign-off are achieved.

**Non-Goals:**
- System-audio capture, on-device ASR/LLM, speaker diarization, offline transcription.
- iOS implementation (seams only).
- Changes to the Python backend, Electron app, or remote protocols.

## Decisions

### 1. KMP `shared` + `androidApp` (mirror the POC)
Pure logic in `commonMain` (deviceless-testable), platform code behind `expect/actual` in `androidMain`, thin `androidApp` shell. Preserves the POC's seam pattern and the "iOS later" goal from the Flutter proposal.

### 2. Reuse the POC's verified VAD detector — do NOT re-port the ONNX session
The Flutter `vad_service.dart` hand-drives Silero: raw probabilities, explicit 0.5/0.35 thresholds, a `[2,1,128]` state tensor, and a 64-sample context buffer — the exact code that produced native crashes. The POC instead uses **`gkonovalov/android-vad:silero`** behind a `VoiceActivityDetector` interface, returning a **boolean per 1024-byte frame** (library durations set to 0). This is verified working and removes the entire ONNX-state porting risk.

**Consequence:** we lose the explicit 0.5/0.35 probability thresholds; per-frame sensitivity is controlled by the library `Mode` (start `NORMAL`, tune if needed). What actually matters for ASR — the **utterance boundary** (2.0s silence), **min 0.25s**, **max 30s** — lives in our own `Segmenter`, so fidelity on segmentation is preserved.

### 3. Gating ≠ segmentation → new `Segmenter`
The POC's `SpeechGate`/`VadGate` answer "is there speech *right now*?" (forward/suppress a chunk + drive an icon). The transcribe app needs "a complete *utterance* just ended — here are its samples + start/end for ASR." So we add a pure-Kotlin **`Segmenter`** (commonMain) on top of the verified detector that ports the Flutter rules:

```
detector boolean per frame ─► Segmenter
   accumulate frames while speaking
   2.0s of silence  → emit SpeechSegment{samples, startTime, endTime}   (if ≥ 0.25s; else discard)
   ≥ 30s no break   → force-emit + start new accumulation
   getPendingAudio() → in-progress samples for the 0.5s interim loop
   flush() on stop   → emit trailing segment if long enough
```

`SpeechGate`'s onset/hangover hysteresis is the conceptual base; `Segmenter` extends it to emit timed audio instead of a forward/suppress boolean. It is fully unit-tested with a `FakeVoiceActivityDetector` (Tier-1).

### 4. Single unidirectional state — the core fix for the reported bugs
The Flutter pipeline exposes **four** `StreamController`s (`onSegment`, `onInterim`, `onTranslation`, `onError`) plus a manual interim-counter save/restore dance — the source of the UI/state glitches. The native app replaces this with **one** immutable `UiState` emitted as a `StateFlow` from a pipeline-owning component; Compose renders snapshots. Translations and interim updates are reductions into that state, not separate streams.

```
ForegroundService ── owns ──► PipelineController(scope = service lifecycle)
   AudioCapture.pcmFrames() ─► VadGate(detector) ─► Segmenter ─► AsrClient ─► TranslationClient
                                          │                          │              │
                                          └──────────── reduce into ─┴──────────────┘
                                                          ▼
                                                StateFlow<UiState>  ──►  Compose UI
```

### 5. Structured concurrency for lifecycle (kills start/stop races)
The pipeline runs in a `CoroutineScope` owned by the foreground service. Start launches it; stop cancels the scope → deterministic teardown of capture, detector (`close()` in `finally`), and in-flight HTTP. This is the same race the POC already solved for `AudioRecord`; we generalize it to the whole pipeline and never null-out shared job references from the caller.

### 6. Ktor for ASR + translation (reuse POC's HttpClientFactory)
Re-express `asr_service.dart` and `translation_service.dart` as Ktor clients on the POC's `HttpClientFactory` (OkHttp engine):
- **ASR**: multipart `POST {base}/v1/audio/transcriptions` (WAV via a ported `WavEncoder`, `model`, optional `language`), retry once on 429/500/502/503, language-name→code normalization, `GET /v1/models` connectivity test.
- **Translation**: `POST {base}/v1/chat/completions`, dual-target selection (skip targets matching segment language), up-to-3-segment context window, parallel `async` per target. Failures are non-blocking.

### 7. Auto-gain behind a flag (validate empirically)
The Flutter pipeline amplifies the mic ~30× (EMA toward peak 0.3) because "Silero expects 0.1–0.5" and the mic delivers ~0.01. The POC verified detection **without** explicit gain, so the library may be more tolerant — but gain may still improve ASR audio quality. Port `AutoGain` (pure Kotlin) behind a config flag; the Tier-2 pass decides whether it is on by default.

### 8. Project structure
```
kmp/
├── settings.gradle.kts · gradle/libs.versions.toml · gradlew (from POC)
├── shared/
│   ├── commonMain/   VoiceActivityDetector, PcmFramer, SpeechGate, VadConfig (reused);
│   │                 Segmenter, AutoGain, PipelineController, AsrClient,
│   │                 TranslationClient, WavEncoder, models, AppConfig, UiState  (new/ported)
│   ├── androidMain/  AudioCapture, HttpClientFactory, AndroidVoiceActivityDetector (reused)
│   └── commonTest/   Segmenter, AutoGain, lang-normalize, translation-target,
│                     WavEncoder, PcmFramer/SpeechGate (Tier-1 deviceless)
└── androidApp/
    ├── MainActivity + Compose UI (transcript / interim / dual translation / settings)
    ├── TranscribeForegroundService (type=microphone; owns the pipeline scope)
    ├── DataStore settings, RECORD_AUDIO + FGS permissions
    └── adb-autostart hook (for the Tier-1 inject-WAV E2E)
docs/                 ← copied POC reference bundle (refs/ + design/plan docs)
server/  (test-only)  ← mock ASR server + inject-WAV E2E harness
```

### 9. Two testing tiers (matches the POC and the repo)
- **Tier-1 (programmatic, deviceless / automated):**
  - `commonTest` unit tests for `Segmenter` (boundary/min/max/interim/flush via `FakeVoiceActivityDetector` + `runTest`), `AutoGain`, language normalization, translation-target selection, `WavEncoder`, and the reused `PcmFramer`/`SpeechGate`.
  - Automated **inject-WAV E2E**: a known speech WAV is fed into the pipeline (bypassing the acoustic path) with ASR pointed at a local **mock server** returning fixed text; assert the resulting segments + translations exactly. Deterministic, offline, CI-friendly. Driven by the POC's adb-autostart pattern (with an `--es injectWav` style extra) or a JVM harness.
- **Tier-2 (manual sensory sign-off, after Tier-1 is green):**
  - Real device: speak → interim updates → final segment → dual translation appear correctly; screen-off recording survives (watch the OEM battery-kill / dontkillmyapp risk); start/stop repeatedly with no crash or stuck state.

## Risks / Trade-offs

**[VAD sensitivity differs from Flutter]** Boolean library output (Mode-tuned) instead of explicit 0.5/0.35 probabilities.
  → Mitigation: segmentation thresholds (the ASR-relevant ones) are owned by `Segmenter`; tune `Mode` in Tier-2; the detector is already device-verified.

**[Auto-gain necessity unknown]** POC verified without gain; Flutter needed ~30×.
  → Mitigation: port behind a flag, decide in Tier-2; gain also affects ASR audio quality, not just detection.

**[ONNX native crash on some OEMs (android-vad issue #39)]** Carried from the POC.
  → Mitigation: pin lib 2.0.10; verify on target device; debug build (minify off) or add `-keep class ai.onnxruntime.** { *; }` for release.

**[Foreground service / OEM battery killing]** Screen-off recording killed by aggressive OEMs.
  → Mitigation: proper `microphone` FGS + persistent notification; document battery-optimization opt-out; the reported Flutter bugs were *not* in this area, lowering concern.

**[Compose + audio threading]** UI must never block on audio/VAD/HTTP.
  → Mitigation: all pipeline work on `Dispatchers.IO`/`Default`; UI only collects an immutable `StateFlow` snapshot.

**[Porting bugs verbatim]** The Flutter logic may contain latent defects (interim counter, gain EMA).
  → Mitigation: port *logic*, not plumbing; the unidirectional state model and unit tests surface drift; reproduce desktop/Python behavior, not Dart workarounds.

**[Two mobile clients coexist]** `flutter/` and `kmp/` until parity.
  → Mitigation: explicit fallback during the build; the Flutter client is deleted as the **final step of this change** (tasks §11) once parity + Tier-2 pass — not deferred to a separate cleanup.

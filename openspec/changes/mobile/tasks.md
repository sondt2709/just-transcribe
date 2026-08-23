## 0. Reference docs & toolchain

- [x] 0.1 Copy the POC's reference bundle into this repo: `audio-stream-poc/docs/refs/` (KMP/Kotlin/Ktor/AudioRecord offline docs) → `docs/refs/`
- [x] 0.2 Copy the POC's design/plan docs (`docs/superpowers/specs/`, `docs/superpowers/plans/`, `E2E-RESULTS.md`, `INSTALL_LOG.md`) → `docs/`
- [x] 0.3 Confirm toolchain matches the POC: Kotlin 2.3.21, AGP 8.13.2, Gradle 8.14.3 wrapper, JDK 17 (pin `org.gradle.java.home`), compileSdk 36, minSdk 26 — verified on this machine (JDK17 @ /opt/homebrew/opt/openjdk@17, SDK @ /opt/homebrew/share/android-commandlinetools)

## 1. KMP scaffold (lift the POC skeleton)

- [x] 1.1 Create `kmp/` with `settings.gradle.kts`, `gradle/libs.versions.toml`, `gradlew` wrapper, `gradle.properties` (JDK 17 pin), `local.properties` (git-ignored SDK path) — lifted from POC
- [x] 1.2 Create `shared` module (`build.gradle.kts`: kotlinMultiplatform + kotlinSerialization + androidLibrary; androidTarget JVM_17; namespace `com.sondt.justtranscribe.shared`)
- [x] 1.3 Create `androidApp` module (`build.gradle.kts`: androidApplication + kotlinAndroid; applicationId `com.sondt.justtranscribe`) — Compose added in §1.4/§8
- [x] 1.4 Deps in `libs.versions.toml`: ktor (core/okhttp), kotlinx serialization/coroutines (+test), `android-vad:silero:2.0.10` (JitPack), AndroidX activity/lifecycle, Compose BOM + activity-compose + material3 + icons + viewmodel/runtime-compose, DataStore. (NOTE: ktor content-negotiation intentionally skipped — JSON parsed directly via kotlinx-serialization.)
- [x] 1.5 Copy reused POC sources into `shared`: `AudioCapture` (expect/actual), `HttpClientFactory` (expect/actual), `PcmFramer`, `SpeechGate`, `VadConfig`, `VoiceActivityDetector`, `AndroidVoiceActivityDetector`; rename package to `com.sondt.justtranscribe` — done (entire POC `kmp/` lifted + renamed)
- [x] 1.6 Build green: `./gradlew :androidApp:assembleDebug` — **BUILD SUCCESSFUL** + shared unit tests pass (onnxruntime native libs packaged). Install on device pending (no device connected — user step)

## 2. Data models (commonMain)

- [x] 2.1 `SpeechSegment` (samples, startTime, endTime)
- [x] 2.2 `TranscriptSegment` (id, text, source, speaker, lang, start, end)
- [x] 2.3 `TranslationResult` (segmentId, translatedText, targetLang)
- [x] 2.4 `AppConfig` (asr base/key/model/language, llm base/key/model, preferredLanguage, preferredLanguage2)
- [x] 2.5 `UiState` (immutable): status, segments, interim text/lang, translations map, error/consecutive-failure count

## 3. VAD segmentation (commonMain, on the verified detector)

- [x] 3.1 Implement `Segmenter`: consume per-frame booleans from `VoiceActivityDetector`, accumulate speech samples, track speech/silence with timing
- [x] 3.2 Emit `SpeechSegment` on 2.0s silence (discard if < 0.25s min speech); force-emit on 30s max
- [x] 3.3 `getPendingAudio()` — return in-progress accumulated samples (≥ min) without clearing, for interim
- [x] 3.4 `flush()` and `reset()` for clean stop/restart (emit trailing segment if long enough)
- [x] 3.5 Port `AutoGain` (EMA toward target peak, max gain clamp, soft-clip) behind a config flag
- [x] 3.6 **Tier-1**: `commonTest` for `Segmenter` (boundary/min/max/interim/flush via `FakeVoiceActivityDetector` + `runTest`) and `AutoGain` — green

## 4. Remote ASR client (Ktor)

- [x] 4.1 Port `WavEncoder`: float32 → int16 + 44-byte RIFF header (commonMain) — + WavEncoderTest green
- [x] 4.2 Implement `AsrClient`: multipart `POST {base}/v1/audio/transcriptions` (file, model, optional language) on `HttpClientFactory`; parse `{text, language}`
- [x] 4.3 Retry once on 429/500/502/503 after 1s; 30s timeout (Ktor `HttpTimeout`)
- [x] 4.4 Language-name→code normalization (english→en, mandarin→zh, …)
- [x] 4.5 `testConnection`: `GET {base}/v1/models` → ok + model list, or typed error (sealed `ConnTest`)
- [x] 4.6 **Tier-1**: `commonTest` for WAV encoding and language normalization — green (HTTP round-trip covered by §9)

## 5. Translation client (Ktor)

- [x] 5.1 Implement `TranslationClient`: `POST {base}/v1/chat/completions` (system translate prompt + user text), parse `choices[0].message.content`
- [x] 5.2 Translation-target selection: compare segment lang vs preferredLanguage + preferredLanguage2, skip matches, dedup
- [x] 5.3 Context window: include up to 3 preceding segments in the prompt
- [x] 5.4 Parallel dual-target translation (`async`/`awaitAll`); per-target failure is non-blocking
- [x] 5.5 **Tier-1**: `commonTest` for target selection and context-window construction — green

## 6. Pipeline orchestrator (commonMain, unidirectional state)

- [x] 6.1 Implement `PipelineController`: own a `CoroutineScope`; wire capture → `Segmenter`(detector) → `AsrClient` → `TranslationClient`. (NOTE: `Segmenter` owns the detector + framing directly and exposes `isSpeaking`, superseding a separate `VadGate` — avoids running two Silero instances.)
- [x] 6.2 Reduce all events (final segment, interim, translation, error) into a single `StateFlow<UiState>` — no per-event StreamControllers
- [x] 6.3 Interim loop: every 0.5s, if pending audio exists and no request in flight, transcribe (assignId=false) and reduce an interim update (busy guard)
- [x] 6.4 Final path: segment → channel (serialized) → ASR → reduce segment → async translation → reduce translation (channel decouples ASR latency from mic capture)
- [x] 6.5 Lifecycle: `start()` launches; `stop()` cancels the job → flush `Segmenter` + `close()` detector under `NonCancellable` (no caller-side job nulling)
- [x] 6.6 Error handling: ASR/translation failures reduce an error into state without tearing down the pipeline — covered by `PipelineControllerTest.reportsErrorWhenAsrThrows`

## 7. Android shell (androidApp)

- [x] 7.1 `TranscribeService` (type `microphone`, persistent notification with Stop action) drives the pipeline (which lives in the process-wide `AppContainer` scope)
- [x] 7.2 AndroidManifest: `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `WAKE_LOCK`, `POST_NOTIFICATIONS`; FGS declaration `type=microphone`; minSdk 26
- [x] 7.3 Permission flow: request `RECORD_AUDIO` (+ `POST_NOTIFICATIONS` on 13+) before starting; FGS started while app visible
- [x] 7.4 Guard: `requestStart()` aborts with an error in `UiState` when `AudioCapture.sampleRate != 16000` (raw 44.1 kHz fallback not implemented — documented)
- [x] 7.5 DataStore settings persistence (`SettingsStore`) replacing shared_preferences

## 8. Compose UI

- [x] 8.1 Home screen: scrollable `LazyColumn` transcript list (speaker label, text, language badge) collecting `UiState`
- [x] 8.2 Interim line below the list, replaced on each interim update
- [x] 8.3 Dual-translation display under each segment with target-language badge
- [x] 8.4 Record/Stop `ExtendedFloatingActionButton` (disabled until ASR configured); speech indicator dot from `Segmenter.isSpeaking`
- [x] 8.5 Auto-scroll to the newest item on new content (NOTE: simplified — always scrolls; "unless user scrolled up" not yet implemented)
- [x] 8.6 Error surface: persistent warning banner after 3 consecutive failures (NOTE: transient snackbar not added; banner covers the failure case)
- [x] 8.7 Settings screen: ASR section (URL/key/model + Test Connection + model dropdown from `/v1/models`), LLM section (URL/key/model), language prefs; first-launch routing when ASR unconfigured (NOTE: separate LLM Test Connection button omitted)

## 9. Tier-1 — automated E2E (inject-WAV vs mock ASR)

- [x] 9.1 Minimal **mock ASR server** at `kmp/test-harness/mock_server.py` (stdlib; `/v1/models`, `/v1/audio/transcriptions`, `/v1/chat/completions`; deterministic transcript)
- [x] 9.2 Inject-WAV entry point: `PipelineController(audioSource = …)` is the injectable seam; `PipelineControllerTest` feeds a synthetic byte flow through the full pipeline
- [ ] 9.3 Automated harness asserting transcript **vs the mock HTTP server** — NOT yet wired. Deviceless coverage today: `PipelineControllerTest` asserts segments + translations end-to-end via fake `Transcriber`/`Translator`. A MockEngine (or JVM-against-`mock_server.py`) test of the real Ktor HTTP path is the remaining piece.
- [x] 9.4 All `commonTest` unit tests green (41 tests, 0 failures)

## 10. Tier-2 — manual sensory sign-off (user)

- [ ] 10.1 Build/install debug APK on the real device; configure ASR + LLM endpoints
- [ ] 10.2 Speak → interim updates appear → final segment appears → dual translation appears correctly
- [ ] 10.3 Screen-off recording survives (verify FGS keeps capturing; check OEM battery-kill behavior)
- [ ] 10.4 Start/stop repeatedly and background/foreground → no crash, no stuck state (the reported Flutter failure mode)
- [ ] 10.5 Decide auto-gain default and VAD `Mode` from observed behavior; record in `E2E-RESULTS`-style notes

## 11. Retire the Flutter client (final step — only after native parity + Tier-2 sign-off)

- [ ] 11.1 Confirm parity: all Tier-1 tests green (§9) and Tier-2 manual sign-off passed (§10), including screen-off recording and repeated start/stop with no crash
- [ ] 11.2 Delete the `flutter/` directory (Dart app, `android/`+`ios/` projects, assets, built APKs)
- [ ] 11.3 Delete the `openspec/changes/flutter-mobile-app/` change (proposal/design/tasks + its `mobile-*` delta specs) — completes "delete the Flutter app and its spec completely"
- [ ] 11.4 Remove Flutter references from `README.md`, `.github/` workflows, and any build/release docs
- [ ] 11.5 Verify the repo still builds without `flutter/` (Electron + Python + `kmp/` unaffected); commit the removal

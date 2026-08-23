## 1. Project Setup

- [x] 1.1 Create Flutter project at `flutter/` with `flutter create --org com.justranscribe --project-name just_transcribe flutter`
- [x] 1.2 Configure `pubspec.yaml` with dependencies: `record`, `flutter_foreground_task`, `flutter_onnxruntime`, `dio`, `shared_preferences`, `permission_handler`
- [x] 1.3 Configure Android manifest: permissions (`RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `WAKE_LOCK`), min SDK 29, foreground service declaration
- [x] 1.4 Download `silero_vad.onnx` model and add to `flutter/assets/`
- [x] 1.5 Set up project directory structure under `lib/` (models, services, screens, widgets)

## 2. Data Models

- [x] 2.1 Create `SpeechSegment` model (samples, startTime, endTime)
- [x] 2.2 Create `TranscriptSegment` model (id, text, source, speaker, lang, start, end)
- [x] 2.3 Create `TranslationResult` model (segmentId, translatedText, targetLang)
- [x] 2.4 Create `AppConfig` model (ASR server URL/key/model, LLM server URL/key/model, preferred languages, ASR language hint) with shared_preferences serialization

## 3. Audio Capture Service

- [x] 3.1 Implement `AudioCaptureService` wrapping the `record` package: `startStream()` returning `Stream<Uint8List>` of PCM16 at 16kHz mono, `stop()`
- [x] 3.2 Implement microphone permission request flow with denied/permanently-denied handling
- [x] 3.3 Implement WAV encoder: convert float32 PCM to int16 + 44-byte RIFF header, producing byte buffer for HTTP upload

## 4. VAD Service

- [x] 4.1 Implement `VadService`: load `silero_vad.onnx` via `flutter_onnxruntime`, run inference on 512-sample chunks, return speech probability
- [x] 4.2 Implement speech segment state machine: speech onset detection (threshold 0.5), silence detection (neg threshold 0.35, min silence 2.0s), min speech duration (0.25s), max speech duration (30s) with force-emit
- [x] 4.3 Implement `getPendingAudio()` for interim transcription (return accumulated buffer without clearing)
- [x] 4.4 Implement `flush()` and `reset()` for clean stop/restart
- [ ] 4.5 Verify VAD output parity with Python Silero VAD using test audio samples

## 5. Remote ASR Service

- [x] 5.1 Implement `AsrService`: encode speech segment as WAV, POST multipart to `{baseUrl}/v1/audio/transcriptions` with model and optional language fields, parse JSON response
- [x] 5.2 Implement retry logic: retry once on HTTP 429/500/502/503 after 1s delay
- [x] 5.3 Implement connection test: `GET {url}/v1/models`, return success with model list or failure with error

## 6. Translation Service

- [x] 6.1 Implement `TranslationService`: POST to `{baseUrl}/v1/chat/completions` with translation prompt, parse response
- [x] 6.2 Implement translation target logic: compare segment lang against preferred_language and preferred_language_2, skip when matching
- [x] 6.3 Implement context window: include up to 3 preceding segments in translation prompt
- [x] 6.4 Implement parallel dual-language translation when both targets differ from segment lang

## 7. Pipeline Orchestrator

- [x] 7.1 Implement `PipelineService`: wire audio stream -> VAD -> ASR -> translate with async Dart streams
- [x] 7.2 Implement VAD processing loop: consume PCM chunks from audio stream, feed to VadService, emit finalized segments
- [x] 7.3 Implement interim loop: every 0.5s, check for pending VAD audio, send to ASR, emit interim events (with busy guard to skip when previous request in-flight)
- [x] 7.4 Implement final transcription: on VAD segment, send to ASR, emit segment event, trigger async translation
- [x] 7.5 Implement start/stop lifecycle: start foreground service + audio + loops; stop flushes VAD, cancels loops, stops service
- [x] 7.6 Implement error propagation: ASR/translation failures emit error events without crashing the pipeline

## 8. Foreground Service Integration

- [x] 8.1 Configure `flutter_foreground_task` with `microphone` service type and persistent notification
- [x] 8.2 Implement notification with stop action to allow stopping recording from notification shade
- [x] 8.3 Integrate foreground service lifecycle with pipeline start/stop
- [ ] 8.4 Test background recording with screen off on Android 14+ device

## 9. Settings Screen

- [x] 9.1 Implement settings screen UI: ASR server section (URL, API key, model selector), LLM server section (URL, API key, model), language preferences (primary, secondary, ASR language hint)
- [x] 9.2 Implement "Test Connection" button for ASR server with success/failure feedback
- [x] 9.3 Implement "Test Connection" button for LLM server
- [x] 9.4 Implement model list fetching: on successful ASR connection test, populate model dropdown from `/v1/models` response
- [x] 9.5 Implement settings persistence via `shared_preferences` with save-on-change
- [x] 9.6 Implement first-launch detection: show settings screen if ASR server not configured

## 10. Home Screen

- [x] 10.1 Implement home screen layout: scrollable transcript area + record/stop button
- [x] 10.2 Implement transcript list: display finalized segments with speaker label, text, language badge
- [x] 10.3 Implement interim text display: updating text below transcript list, replaced on each interim event
- [x] 10.4 Implement translation display: show translated text below corresponding segment with target language label
- [x] 10.5 Implement auto-scroll: scroll to bottom on new content unless user has scrolled up
- [x] 10.6 Implement record button state: disabled when ASR not configured, toggle between record/stop icons
- [x] 10.7 Implement error snackbar: non-blocking toast for pipeline errors, persistent warning after 3 consecutive failures

## 11. iOS Support (Minimal)

- [x] 11.1 Configure iOS `Info.plist`: `NSMicrophoneUsageDescription`, microphone usage description string
- [x] 11.2 Implement iOS foreground-only behavior: pause recording on background, resume on foreground
- [ ] 11.3 Test microphone capture on iOS simulator/device

## 12. Integration Testing

- [ ] 12.1 End-to-end test: record -> VAD detects speech -> ASR returns text -> segment displayed on screen
- [ ] 12.2 Test with screen off on Android: verify transcription continues via foreground service
- [ ] 12.3 Test translation flow: verify translation appears below segment when language differs
- [ ] 12.4 Test error handling: disconnect ASR server mid-recording, verify app continues gracefully
- [ ] 12.5 Test settings persistence: configure, restart app, verify settings restored

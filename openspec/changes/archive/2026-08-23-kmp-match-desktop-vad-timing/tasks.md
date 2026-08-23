# Tasks: kmp-match-desktop-vad-timing

## 1. Config change

- [x] 1.1 In `kmp/shared/src/commonMain/kotlin/com/sondt/justtranscribe/Segmenter.kt`, change `SegmenterConfig` defaults: `minSilenceSec = 2.0` → `1.0`, `maxSpeechSec = 30.0` → `15.0`. Update the `SegmenterConfig` and `Segmenter` doc comments so they state the actual desktop-matching values (0.25s / 1.0s / 15s) instead of the stale claim.

## 2. Tests

- [x] 2.1 Update `SegmenterTest.kt` timing math: header comment (minSilence 1.0s = 16000 samples ≥ 32 frames; maxSpeech 15s = 240000 samples ≥ 469 frames); `emitsSegmentAfterMinSilence` silenceFrames 63 → 32; `doesNotEmitBeforeSilenceThreshold` comment (30*512 = 15360 < 16000); `forceEmitsAtMaxDuration` 938 → 469 frames and assertion ≥ 240000.
- [x] 2.2 Update `PipelineControllerTest.kt` line-65 comment ("cross the 2.0s boundary" → 1.0s); 63 silent frames still exceed the new 32-frame threshold, no functional change.
- [x] 2.3 Run shared-module tests: `cd kmp && ./gradlew :shared:testDebugUnitTest` (or `:shared:allTests`) and confirm green.

## 3. Spec sync

- [x] 3.1 Confirm delta spec `specs/mobile-vad/spec.md` in this change reflects 1.0s / 15s (done at proposal time; verify wording matches implementation).

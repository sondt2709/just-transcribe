# Design: kmp-match-desktop-vad-timing

## Context

KMP Android pipeline translates only finalized speech segments. `SegmenterConfig` defaults (`minSilenceSec = 2.0`, `maxSpeechSec = 30.0`) are double the desktop Python values (`VAD_MIN_SILENCE_S = 1.0`, `VAD_MAX_SPEECH_S = 15.0` in `python/src/just_transcribe/config.py`), even though `Segmenter.kt` doc comments claim they mirror desktop. Result: in noise or long speech, segments finalize late (up to 30s), so translation looks stuck while interim transcript keeps updating.

## Goals / Non-Goals

**Goals:**
- Make KMP segmentation timing identical to desktop: min silence 1.0s, max speech 15s.
- Fix the misleading doc comments and the `mobile-vad` spec requirement.
- Keep all existing tests green (update any that encode 2.0s / 30s).

**Non-Goals:**
- No change to VAD detector, threshold/mode, or silence-counter reset behavior (noise-debounce rejected as too risky for now).
- No change to `maxSpeechSec` below desktop's 15s.
- No change to desktop or Flutter pipelines.

## Decisions

- **Change the `SegmenterConfig` defaults, not the `AppContainer` call site.** The defaults are documented as mirroring desktop; the bug is that they don't. Fixing at the source keeps tests, the test harness, and any future call sites consistent. Alternative (pass explicit config in `JustTranscribeApp.kt`) would leave wrong defaults lying around.
- **Values copied verbatim from desktop constants** (1.0 / 15.0), no new tuning. This change is a parity fix, not a tuning exercise.

## Risks / Trade-offs

- [Slow speakers pausing >1s get utterances split more often] → Same trade-off desktop already ships; acceptable by decision.
- [Existing unit tests may encode old timing] → Task explicitly updates `SegmenterTest.kt` (and any other timing-sensitive tests) to the new defaults.

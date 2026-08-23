# Proposal: kmp-match-desktop-vad-timing

## Why

On the KMP Android app, translation appears stuck ("pending") during long speech or in noisy environments while the interim transcript keeps updating. Translation only runs on finalized segments, and the KMP `SegmenterConfig` defaults (min silence 2.0s, max speech 30s) are double the desktop pipeline's values (1.0s / 15s) — despite a code comment claiming they mirror desktop. Noise blips reset the 2.0s silence window, so segments frequently ride to the 30s force-emit before any translation happens.

## What Changes

- Change `SegmenterConfig` defaults in `kmp/shared` to match the desktop Python pipeline: `minSilenceSec` 2.0 → 1.0, `maxSpeechSec` 30.0 → 15.0.
- Correct the misleading doc comments in `Segmenter.kt` that claim the old values mirror desktop.
- Update the `mobile-vad` spec (from the in-progress `mobile` change) whose "Utterance segmentation" requirement hardcodes 2.0s / 30s.
- Update existing Segmenter unit tests that assume 2.0s / 30s timing.

No behavior change beyond timing: same VAD detector, same segmentation algorithm, same translation trigger.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `mobile-vad`: "Utterance segmentation" requirement timing changes from min-silence 2.0s / max-speech 30s to 1.0s / 15s, matching the desktop transcription pipeline.

## Impact

- `kmp/shared/src/commonMain/kotlin/com/sondt/justtranscribe/Segmenter.kt` — default config values + doc comment.
- `kmp/shared/src/commonTest/kotlin/com/sondt/justtranscribe/SegmenterTest.kt` (and any other tests using timing defaults).
- `openspec/changes/mobile/specs/mobile-vad/spec.md` — parent change spec stays as-is; this change carries the delta.
- User-visible: worst-case translation latency on Android drops from ~30s to ~15s; typical finalize latency after speech ends drops from 2s to 1s. Slightly higher chance of splitting an utterance during a slow pause (same trade-off desktop already accepts).

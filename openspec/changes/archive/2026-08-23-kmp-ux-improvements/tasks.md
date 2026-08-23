# Tasks: kmp-ux-improvements

## 1. Shared: pipeline & model groundwork

- [x] 1.1 Add `@Serializable` to `TranscriptSegment` and `TranslationResult`; add `@Serializable data class TranscriptSnapshot(segments, translations)` in shared commonMain
- [x] 1.2 Change `Transcriber.resetCounter()` to `resetCounter(start: Int = 0)`; update `AsrClient` so the next assigned id is `start + 1`; update fakes in the test harness
- [x] 1.3 `PipelineController`: remove `asr.resetCounter()` from `start()`; add `clearTranscript()` (clears segments/translations/interim/error; resets counter only when idle) and `restore(snapshot)` (idle-only: sets state, seeds counter to max restored id)
- [x] 1.4 `TranslationClient`: add a way to seed the `recent` context deque from restored segments (e.g. `seedContext(segments)`); call it from restore wiring
- [x] 1.5 Add pure export formatter in shared commonMain (`TranscriptExporter.format(segments, translations)`) matching the UI layout (speaker + [LANG], text, one `[LANG] text` line per translation, blank line between segments)
- [x] 1.6 Unit tests: counter seeding, clear semantics (idle vs recording), export formatting with 0/1/2 translations

## 2. Android: persistence & container wiring

- [x] 2.1 New `TranscriptStore.kt` in androidApp: read/write/delete `filesDir/transcript.json` via kotlinx-serialization on `Dispatchers.IO`; `hasSnapshot()` check
- [x] 2.2 `AppContainer`: collect `pipeline.state`, debounce ~500ms, persist snapshot on segment/translation changes; flush on `requestStop()`
- [x] 2.3 `AppContainer`: expose `clearTranscript()` (controller clear + delete file), `resume()` (load snapshot → `pipeline.restore` + seed translation context → `requestStart`), `startFresh()` (delete file + idle clear + `requestStart`), and `hasHistory` state for the UI

## 3. Android: home screen rework

- [x] 3.1 Remove Scaffold FAB; add bottom control cluster overlay: centered 80dp circular mic/stop button, clear button (left, shown when transcript non-empty), resume button (right, shown when idle ∧ history exists ∧ list empty)
- [x] 3.2 Add `SpeakingBars` composable (3 bars, `rememberInfiniteTransition`, staggered; static dots when `speechActive` false) and render it inside the recording-state stop button; delete the top-bar `SpeechIndicator`
- [x] 3.3 Set `LazyColumn` `contentPadding` bottom ≈ 120dp so the last card scrolls above the controls
- [x] 3.4 Wire mic tap → `startFresh()` on empty list / plain start when list non-empty; stop tap → stop; resume tap → `resume()`; clear tap → `clearTranscript()` (no dialog). Route start/stop through `TranscribeService` as today
- [x] 3.5 Tap-to-copy: clickable original text and translation rows → clipboard; snackbar "Copied" only on API < 33
- [x] 3.6 Top bar actions: Copy (export text → clipboard) and Share (`ACTION_SEND` chooser, `text/plain`), both disabled when transcript empty

## 4. Android: settings screen

- [x] 4.1 Add `imePadding()` to the Settings scroll column and `android:windowSoftInputMode="adjustResize"` on MainActivity in the manifest
- [x] 4.2 LLM section: Test Connection button using `container.testConnection(draft.llmApiBase, draft.llmApiKey)` with its own result line
- [x] 4.3 LLM model field switches to the existing `ModelDropdown` when the LLM test returns models

## 5. Verify

- [x] 5.1 Run shared unit tests (`./gradlew :shared:testDebugUnitTest` or equivalent) — all green
- [x] 5.2 Build APK and manually verify: centered button both hands, bars animate on speech, last card scrolls clear, per-row copy, copy/share export matches UI, clear works idle+recording, stop → kill app → reopen → resume continues with old segments and new ids appended, settings scroll over keyboard, LLM test + model dropdown, launcher icon on release install

## 6. Cleanups & launcher icon (post-verification additions)

- [x] 6.1 Replace deprecated Compose `LocalClipboardManager` in `HomeScreen.kt` with the platform `ClipboardManager` service (`ClipData.newPlainText`)
- [x] 6.2 Drop the dead empty-snapshot delete path in `TranscriptStore.save` (persistLoop already filters empty snapshots)
- [x] 6.3 Add adaptive launcher icon: `drawable/ic_launcher_background.xml` (teal gradient), `drawable/ic_launcher_foreground.xml` (white mic vector from `flutter/icon.svg`, scaled into the 66dp safe zone), `mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml` with monochrome layer; declare `android:icon`/`android:roundIcon` in the manifest
- [x] 6.4 Build debug + release APKs; confirm both contain the icon resources

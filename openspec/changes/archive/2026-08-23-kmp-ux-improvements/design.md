# Design: kmp-ux-improvements

## Context

The KMP Android app (`kmp/androidApp` + `kmp/shared`) renders a single `UiState` StateFlow owned by `PipelineController` (process-lifetime, in `AppContainer`). The home screen uses a Scaffold `ExtendedFloatingActionButton` (bottom-end), a 12dp dot speech indicator in the top bar, and a `LazyColumn` of segment cards keyed by segment id. Segment ids come from `AsrClient.segmentCounter`, reset to 0 on every `start()`. Nothing is persisted except settings (DataStore); killing the process loses the transcript. Settings is a `verticalScroll` Column with no IME awareness; only the ASR section has a connection test (`GET {base}/v1/models`).

Latent bug worth noting: stop → start again resets the id counter while old segments stay in the list, so new segments collide with old ids (LazyColumn `key = { it.id }` crash risk, translations map corruption). The new-session semantics below fix this.

## Goals / Non-Goals

**Goals:**
- Symmetric one-hand record control; no overlap of last transcript item.
- Meet-style speaking feedback on the stop button; slimmer top bar.
- Copy (per-row and whole), share/export, clear — all matching what the UI shows.
- Transcript survives process death; user can resume the previous conversation.
- Settings usable with keyboard open; LLM section reaches parity with ASR section (test + model dropdown).

**Non-Goals:**
- No changes to desktop Electron/Python app or Flutter app.
- No multi-conversation history browser (single most-recent conversation only).
- No export formats beyond plain text (share sheet handles file/Drive targets).
- No iOS work.

## Decisions

### 1. Bottom control cluster replaces Scaffold FAB

Remove `floatingActionButton` from Scaffold. Add a `Box`-overlaid bottom control row, centered:

```
│  [segment card]                  │
│  [segment card]        ← scrolls under controls,
│                          bottom contentPadding ≈ 120dp
│   🗑          (🎤)        ⟳      │   idle: mic circle; Resume ⟳ only when
│  clear      80dp circle  resume  │   idle ∧ history exists ∧ list empty
```

- Big circle: `FilledIconButton`-style 80dp circle. Idle → mic icon, `primaryContainer`. Recording → Meet bars (see 2), `errorContainer`, acts as Stop.
- Clear: small `FilledTonalIconButton` (Delete icon) left of the mic, visible when segments or interim exist. No confirmation (user decision).
- Resume: small tonal button right of the mic, shown only when idle, persisted history exists, and current list is empty (fresh launch). Tap = restore + start recording (single-tap continue).
- `LazyColumn` gets `contentPadding` bottom ≈ 120dp so the last card scrolls clear.

Alternative considered: M3 `BottomAppBar` with embedded FAB — rejected: M3 pins the FAB to the end slot, and a full-width bar wastes vertical space.

### 2. Meet-style speaking indicator lives on the stop button

New `SpeakingBars` composable: three vertical rounded bars, `rememberInfiniteTransition`, staggered phase per bar. `speechActive == true` → bars animate heights (mini equalizer); `false` → three static short dots. Rendered inside the recording-state circle button (white bars on `errorContainer`). The top-bar `SpeechIndicator` dot is deleted, freeing header space for Copy/Share/Settings.

### 3. Session semantics: explicit new vs. resume, counter never resets on start

- `PipelineController.start()` stops calling `asr.resetCounter()`. Counter reset becomes part of *clear* only.
- `clearTranscript()` (new, on controller): resets segments/translations/interim/error in state and calls `asr.resetCounter()`. Allowed anytime; while recording it just empties the visible list and future ids continue from the live counter (no reset while recording to avoid collisions with in-flight segments — reset only when idle).
- `restore(snapshot)` (new, idle-only): sets segments+translations into state and seeds the counter via `Transcriber.resetCounter(next: Int)` (signature gains a default-0 start value) to `maxId`. Also re-seeds `TranslationClient.recent` context so resumed translations keep conversation context.
- Mic tap when idle **with a non-empty visible list** continues the on-screen conversation (append; ids keep counting). Mic tap on a fresh empty screen starts new. "New after resume" = Clear then record.

This fixes the latent stop/start id-collision bug as a side effect.

### 4. Persistence: JSON snapshot on disk, debounced

- New `@Serializable data class TranscriptSnapshot(segments, translations)` in `shared` commonMain (`TranscriptSegment`/`TranslationResult` gain `@Serializable`; kotlinx-serialization already on the shared classpath).
- New `TranscriptStore` in `androidApp`: reads/writes `filesDir/transcript.json` via `Json`. Not DataStore — a single JSON file is simpler for a list payload and trivially clearable.
- `AppContainer` collects `pipeline.state`, debounces ~500ms, writes snapshot whenever segments/translations change (survives process death mid-session, not just on stop). Clear deletes the file.
- On launch nothing auto-loads into `UiState`; the store only feeds the Resume button (existence check + snapshot on demand). Keeps startup deterministic.

Alternative considered: Room — overkill for one conversation of text.

### 5. Copy / share / export

- Export formatter is a pure function in `shared` commonMain (unit-testable), mirroring the UI exactly:

  ```
  You [EN]
  Hello there
  [VI] Xin chào

  You [VI]
  ...
  ```

- Per-row copy: `Modifier.clickable` on the original text and on each translation row → clipboard. On API < 33 show a snackbar "Copied"; on 33+ rely on the system clipboard overlay (avoid double toast per Android guidance).
- Top bar: Copy icon (whole transcript → clipboard) and Share icon (`ACTION_SEND`, `text/plain`, chooser). The share sheet's built-in targets (Files, Drive, Quick Share) satisfy "save to a file or share" with zero extra code. Both disabled when the transcript is empty.

### 6. Settings: IME-aware scrolling

Add `Modifier.imePadding()` to the scrolling Column (after `padding(padding)`) and `android:windowSoftInputMode="adjustResize"` on the activity. Focused field then stays above the keyboard; the whole form scrolls with keyboard open.

### 7. LLM Test Connection reuses the ASR probe

`AsrClient.testConnection(url, apiKey)` is already a generic `GET {url}/v1/models` probe with no ASR-specific logic, and the LLM endpoint is OpenAI-compatible — the same `/v1/models` works. SettingsScreen adds a second Test button calling `container.testConnection(draft.llmApiBase, draft.llmApiKey)`, its own result line, and reuses the existing `ModelDropdown` for `llmModel` when models are returned. No shared-code changes.

## Risks / Trade-offs

- [Restore seeds counter but a stale snapshot could hold huge text] → payload is plain text of one conversation; JSON read/write on `Dispatchers.IO`, negligible size.
- [Debounced writes could lose the last ≤500ms of updates on abrupt process kill] → acceptable; a flush also happens on `requestStop()`.
- [Clear while recording no longer resets ids] → intentional (avoids collisions with in-flight ASR); ids restart only on idle clear, invisible to the user.
- [`adjustResize` interacts with edge-to-edge on API 35 targets] → `imePadding()` is the canonical Compose fix and is a no-op when insets are already consumed.
- [Resume assumes ASR server unchanged; restored ids must stay unique] → counter seeding uses `maxId` from the snapshot regardless of server.

## Open Questions

None blocking — user resolved indicator style, button placement, confirmation, export format, and resume flow in review.

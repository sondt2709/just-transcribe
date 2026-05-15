## Context

The app currently supports a single translation target language (`preferred_language`). The `TranslationService` translates each ASR segment to that one language via an OpenAI-compatible LLM API. The frontend displays one translation box per segment. Users in multilingual conversations need segments translated into two languages simultaneously.

Key files:
- `python/src/just_transcribe/pipeline/translate.py` — TranslationService with single-target translation
- `python/src/just_transcribe/pipeline/orchestrator.py` — dispatches translation after ASR
- `python/src/just_transcribe/server.py` — WebSocket broadcast of `translate` events
- `python/src/just_transcribe/config.py` — AppConfig dataclass + config.toml persistence
- `electron/src/renderer/components/Transcript.tsx` — renders segments + translation
- `electron/src/renderer/components/Settings.tsx` — language selection UI
- `electron/src/renderer/hooks/useTranscript.ts` — WebSocket message handling

## Goals / Non-Goals

**Goals:**
- Support an optional second translation target language
- Smart-skip translations when a target matches the detected language
- Run both translations in parallel to avoid added latency
- Friendly UI that doesn't clutter when only one language is active
- Minimal changes to the existing translation pipeline

**Non-Goals:**
- More than 2 translation languages (not needed, keeps costs bounded)
- Single-prompt batched translation (optimization for later)
- Per-segment language targeting (always uses the global config)
- Split-view or per-person view modes

## Decisions

### 1. Two independent LLM calls (not a single batched prompt)

Each translation target fires its own LLM call. Both run concurrently via `asyncio.gather`.

**Why over batched prompt:** Simpler, more reliable. A batched prompt ("translate to both VI and ZH, return JSON") risks parse failures that lose both translations. Independent calls isolate failures — if one fails, the other still arrives. Cost is the same (similar total tokens). Latency is the same since they run in parallel.

### 2. Extend WebSocket `translate` event with `target_lang` field

Current event: `{type: "translate", id, text}`
New event: `{type: "translate", id, text, target_lang: "vi"}`

**Why:** The frontend needs to know which translation slot to fill. Adding `target_lang` is backward-compatible — existing clients that ignore the field still work (they'd just overwrite the single translation slot, which is fine for the 1-language case).

### 3. Store translations as a map in frontend state

Change segment translation state from `translation: string | null` to `translations: Record<string, string>` keyed by target language code.

**Why:** Cleanly supports 1 or 2 translations without special-casing. The Transcript component iterates over the map entries.

### 4. Config: add `preferred_language_2` (empty string = disabled)

Same pattern as existing `preferred_language`. Empty string means disabled, matching how other optional config fields work (`llm_api_base`, `asr_language`).

**Why over an array field:** Avoids migration complexity. A second optional field is simpler than changing the type of an existing field. Config.toml stays flat and readable.

### 5. UI: second dropdown appears inline, disabled state is "None"

Settings shows two dropdowns side by side. The second defaults to "None" (empty). The dropdown prevents selecting the same language as Lang 1 (grayed out or filtered). No toggle switch needed — "None" is the off state.

**Why:** Minimal UI surface. Users who don't need it see one extra dropdown set to "None". No modal, no toggle, no extra settings section.

### 6. Smart skip logic

```
for each target in [preferred_language, preferred_language_2]:
    if target is empty → skip (disabled)
    if target == segment.lang → skip (already in that language)
    else → translate
```

This means 0, 1, or 2 LLM calls per segment depending on overlap.

## Risks / Trade-offs

- **[2x LLM cost]** → Mitigated by making Lang 2 optional and smart-skip. Users opt in knowingly.
- **[Added latency if LLM is slow]** → Mitigated by parallel calls. Worst case is same as single translation (bound by the slower call).
- **[Transcript visual density]** → Mitigated by compact translation boxes with language labels. Two small boxes are manageable. If both translations are present, they stack vertically.
- **[Translation context window shared]** → Both calls use the same recent-segments context deque. No issue — they read but don't mutate it.

## 1. Data Structure

- [x] 1.1 Create `ContextEntry` dataclass in `translate.py` with fields: `text` (source), `speaker`, `lang` (detected language), `translations` (dict mapping target_lang → translated_text)
- [x] 1.2 Replace `_recent_segments: deque[TranscriptSegment]` with `_context_window: deque[ContextEntry]` using `maxlen=4` (3 previous + 1 current)

## 2. Context Storage

- [x] 2.1 In `translate_multi()`, create a `ContextEntry` from the incoming segment and append it to the deque before translating
- [x] 2.2 After each successful `_translate_to()` call, update the current `ContextEntry.translations[target_lang]` with the completed translation text
- [x] 2.3 Handle failed translations gracefully — leave the target_lang key absent from `translations` dict so the prompt builder falls back to source-only for that entry

## 3. Prompt Restructuring

- [x] 3.1 Rewrite context building in `_translate_to()` to iterate over previous `ContextEntry` items (excluding current), emitting bilingual pairs: `[Speaker] {source_lang}: {text}` + `[Speaker] {target_lang}: {translation}` when translation is available, or source-only when not
- [x] 3.2 Update system prompt to structured format: role instruction with explicit source/target language names, previous exchanges block, and "Translate:" directive
- [x] 3.3 Use `LANG_NAMES` mapping to label context lines with human-readable language names (e.g., "Japanese" not "ja")
- [x] 3.4 Select per-target-language translations from context — when translating to Vietnamese, include Vietnamese translations from previous entries (not Chinese)

## 4. Verification

- [x] 4.1 Test with a live conversation: verify translated context appears in LLM requests by enabling debug logging of the prompt sent to the API
- [x] 4.2 Verify edge cases: first segment (no context), second segment (1 context entry), failed previous translation (source-only fallback)
- [x] 4.3 Verify latency stays within 5-second budget with the expanded context window

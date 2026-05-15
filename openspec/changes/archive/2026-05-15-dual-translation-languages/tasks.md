## 1. Backend Config

- [x] 1.1 Add `preferred_language_2: str = ""` field to `AppConfig` in `config.py`
- [x] 1.2 Wire `preferred_language_2` through the `/api/config` GET/PUT endpoints in `server.py`

## 2. Backend Translation Logic

- [x] 2.1 Update `TranslationService` to accept a list of target languages and expose a `translate_multi()` method that runs translations in parallel via `asyncio.gather`
- [x] 2.2 Update `should_translate()` or add `get_translation_targets()` that returns the list of target languages that differ from the segment's detected language (smart skip)
- [x] 2.3 Update `_on_translation` callback in `server.py` to include `target_lang` in the WebSocket `translate` event payload
- [x] 2.4 Update `PipelineOrchestrator` to call the multi-target translation dispatch instead of single-target

## 3. Frontend State

- [x] 3.1 Change segment translation state from `translation: string | null` to `translations: Record<string, string>` in `useTranscript.ts`
- [x] 3.2 Update WebSocket `translate` message handler to populate the translations map using `target_lang` as key

## 4. Frontend UI — Transcript

- [x] 4.1 Update `Transcript.tsx` to render multiple translation boxes with language labels, stacked vertically
- [x] 4.2 Show language badge (e.g., "VI", "ZH") on each translation box

## 5. Frontend UI — Settings

- [x] 5.1 Add "Translation Language 2" dropdown in `Settings.tsx` with "None" as default option
- [x] 5.2 Wire the dropdown to read/write `preferred_language_2` via the config API
- [x] 5.3 Prevent selecting the same language for both dropdowns (disable or filter the duplicate option)

## 6. Verify

- [x] 6.1 Test with only Lang 1 set — verify existing single-translation behavior unchanged
- [x] 6.2 Test with both languages set — verify two translation boxes appear per segment
- [x] 6.3 Test smart skip — speak in a language that matches one target, verify only the other translation fires

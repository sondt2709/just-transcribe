## Why

Users sometimes use the app for multilingual conversations (e.g., a Vietnamese speaker and a Chinese speaker communicating in English). Currently, only one translation target language is supported. Adding an optional second translation language lets each segment be translated into two languages simultaneously, so all participants can follow along. The second language is optional to avoid doubling LLM costs when not needed.

## What Changes

- Add a `preferred_language_2` config field (optional, default empty/disabled)
- Backend translation service translates each segment into both target languages (in parallel) when both are set; skips translation for any target that matches the segment's detected language
- WebSocket `translate` events carry a language identifier so the frontend can display multiple translations per segment
- Frontend displays up to 2 translation boxes per segment, each labeled with its target language
- Settings UI gets a second "Translation Language 2" dropdown with a "None" option (disabled by default)
- Smart skip: if the detected language matches one of the two targets, only the other translation is performed (saves one LLM call)

## Capabilities

### New Capabilities
- `dual-translation`: Support for translating each transcript segment into up to two target languages simultaneously, with smart skipping when a target matches the detected language

### Modified Capabilities
- `translation`: Translation trigger logic changes from single-target to multi-target; WebSocket event payload gains a `target_lang` field
- `app-config`: New `preferred_language_2` field in config.toml and AppConfig dataclass

## Impact

- **Backend**: `translate.py` (TranslationService), `orchestrator.py` (translation dispatch), `server.py` (WebSocket events), `config.py` (AppConfig)
- **Frontend**: `Transcript.tsx` (render multiple translations), `Settings.tsx` (second language dropdown), `useTranscript.ts` (handle multi-translation events), `Controls.tsx` (possible quick-toggle)
- **Config**: `config.toml` schema gains `preferred_language_2`
- **API cost**: Up to 2x LLM calls per segment when both languages active; mitigated by smart skip and optional nature of Lang 2

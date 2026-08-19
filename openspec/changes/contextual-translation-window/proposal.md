## Why

Translation quality is poor because the LLM receives only source-language context (previous segments' original text) without their translations. Research from WMT 2024 and multiple 2023-2025 studies shows that including bilingual source+target pairs in context yields significantly better translations — improving lexical consistency, pronoun resolution, and ASR error correction. The current 2-segment source-only context captures roughly 60-75% of possible contextual improvement; switching to 3 bilingual pairs captures 80-90%.

## What Changes

- Expand the translation context window from 2 source-only segments to 3 source+target bilingual pairs
- Store completed translation results alongside source segments for use as context in subsequent translations
- Restructure the translation prompt to present bilingual pairs (source text + its translation) instead of source-only text
- Add a structured prompt format with explicit source/target language labels per the WMT 2024 winning approach

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `translation`: The "Translation context window" requirement changes from source-only context to bilingual source+target pairs, window size from 2 to 3 previous segments, and the prompt structure changes to include completed translations as context anchors.

## Impact

- **Backend**: `python/src/just_transcribe/pipeline/translate.py` — `TranslationService` class needs to store translation results in the context deque (not just `TranscriptSegment`), rebuild prompt construction in `_translate_to()`
- **No frontend changes** — the Electron app receives translation results via WebSocket push; the context enrichment is entirely server-side
- **No new dependencies** — uses the same OpenAI-compatible API with ~120-160 extra tokens per call (~$0.001/hr additional cost at GPT-4o-mini pricing)
- **Latency**: negligible impact — the extra tokens add ~5-10ms to LLM inference, well within the existing 5-second latency budget

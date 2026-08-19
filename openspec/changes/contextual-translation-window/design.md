## Context

The `TranslationService` in `translate.py` maintains a `deque(maxlen=3)` of recent `TranscriptSegment` objects and passes up to 2 previous segments as source-only context in the translation prompt. Research from WMT 2024 and 2023-2025 academic papers consistently shows that bilingual context (source + target pairs) significantly outperforms source-only context for LLM-based translation, and that 3 previous pairs is the optimal window size.

Current prompt structure:
```
System: "Translate to {lang}. Context: [Speaker]: {source_text}..."
User: "{current_text}"
```

The context includes only original transcribed text — the LLM never sees how previous segments were translated, losing lexical consistency anchoring.

## Goals / Non-Goals

**Goals:**
- Improve translation quality by providing bilingual context (source + completed translation) for each previous segment
- Increase context window from 2 to 3 previous segments to capture ~80-90% of contextual improvement
- Restructure prompt to follow the bilingual pair format validated by WMT 2024 top-performing systems
- Maintain latency within the existing 5-second budget

**Non-Goals:**
- Long-session summarization (hybrid summary + recent pairs for 10+ turn sessions — future enhancement)
- Chain-of-thought or multi-step reasoning in translation prompts (research shows this degrades quality)
- Changing the LLM model or API interface
- Frontend changes (context enrichment is entirely server-side)

## Decisions

### 1. Store bilingual pairs instead of raw segments

**Decision**: Replace `deque[TranscriptSegment]` with a `deque[ContextEntry]` dataclass that holds the source segment text, speaker, detected language, and a dict of completed translations keyed by target language.

**Why**: The translation of segment N must be available when building context for segment N+1. Storing both source and target together in the deque is the simplest way to achieve this.

**Alternative considered**: Keep the segment deque and maintain a separate translation cache keyed by segment ID. Rejected — adds complexity with no benefit since the deque already provides the recency window.

### 2. Window size of 3 previous bilingual pairs

**Decision**: Use `deque(maxlen=4)` (3 previous + 1 current) to provide 3 bilingual context pairs.

**Why**: Multiple independent studies converge on 3 as the sweet spot:
- Yang et al. WMT 2024: window=2 optimal, window=3 used in production
- Sun et al. 2025: k=3 best in range 1-3
- Wu et al. 2024: N=3 as the established working point
- Diminishing returns: 3 pairs captures 80-90% of total contextual improvement; going to 5 adds <10% more

**Alternative considered**: Window of 5 (Sia & Duh 2023 found best at 5). Rejected — marginal gain doesn't justify the extra tokens for real-time use, and the studies showing 5 were on document-level MT, not streaming chat.

### 3. Include both source and target in context block

**Decision**: Each context entry in the prompt shows both the original text and its translation, labeled by language.

**Why**: From "Promoting Target Data in Context-Aware NMT" (2024): "combining both source and target context leads to significant gains across the board." Target-language anchoring ensures lexical consistency (e.g., a term is translated the same way throughout a conversation).

**Alternative considered**: Source-only context (current approach). This is what we're moving away from — it misses the main quality improvement opportunity.

### 4. Prompt structure: structured bilingual pairs format

**Decision**: Use the format validated by WMT 2024 winning submissions:
```
System: "You are a professional translator. Translate from {source_lang} to {target_lang}.
Output ONLY the translation, nothing else.

Previous exchanges:
[Speaker] {source_lang}: {prev_source_1}
[Speaker] {target_lang}: {prev_translation_1}

[Speaker] {source_lang}: {prev_source_2}
[Speaker] {target_lang}: {prev_translation_2}

[Speaker] {source_lang}: {prev_source_3}
[Speaker] {target_lang}: {prev_translation_3}

Translate:"

User: "{current_text}"
```

**Why**: This format gives the LLM explicit language labels and speaker attribution, enabling better pronoun resolution and register consistency. The "Output ONLY the translation" instruction is retained — Zhu et al. 2023 showed chain-of-thought degrades translation quality by up to 8.8 COMET points.

### 5. Populate translations into context after completion

**Decision**: After `translate_multi()` completes for a segment, update the corresponding `ContextEntry` in the deque with the translation results. The next segment's translation will then have access to these bilingual pairs.

**Why**: This is the natural flow — segments arrive sequentially from ASR, and each segment's translation completes before the next segment arrives (ASR latency > translation latency in most cases). No synchronization complexity needed.

**Edge case**: If a translation fails (API error/timeout), the context entry will have the source text but no translation for that language. The prompt builder should gracefully omit the target line for that entry, falling back to source-only context for that particular segment.

### 6. Per-target-language context

**Decision**: When translating to language X, include translations in language X from previous segments (not translations in other target languages).

**Why**: The context should anchor the specific target language. If translating to both Vietnamese and Chinese, the Vietnamese translation prompt should see previous Vietnamese translations, and the Chinese prompt should see previous Chinese translations. This provides the correct lexical consistency anchoring per language.

## Risks / Trade-offs

- **[Translation failure gaps in context]** → If a previous segment's translation failed, that entry will have source-only context (no target pair). Mitigation: graceful degradation — source-only is still better than no context. This matches the current behavior.
- **[Ordering dependency]** → Translation results must be stored back before the next segment is processed. Mitigation: This is already the natural flow since ASR segments arrive sequentially. No code change needed for ordering.
- **[Token cost increase]** → ~120-160 extra input tokens per call. Mitigation: At GPT-4o-mini pricing this is ~$0.001/hr — negligible.
- **[First few segments have sparse context]** → Segments 1-3 will have fewer than 3 context pairs. Mitigation: The prompt builder already handles this (build from whatever is available). Quality naturally improves as the conversation progresses.

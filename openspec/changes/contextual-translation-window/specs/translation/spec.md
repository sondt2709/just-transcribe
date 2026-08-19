## MODIFIED Requirements

### Requirement: Translation context window
The system SHALL maintain a sliding window of the 3 most recent completed segment translations as bilingual context for subsequent translation requests. Each context entry SHALL include both the original source text and its completed translation in the target language, labeled by language name. When translating to a specific target language, the context SHALL include previous translations in that same target language. If a previous segment's translation is unavailable (due to API failure or language match skip), the context entry SHALL fall back to source-only text for that segment.

#### Scenario: Translation with bilingual context
- **WHEN** translating segment N to English, and segments N-3, N-2, N-1 have completed English translations
- **THEN** the translation prompt SHALL include all 3 previous segments as bilingual pairs, each showing the original text and its English translation, with speaker attribution and language labels

#### Scenario: Translation with partial context at conversation start
- **WHEN** translating segment 2 (only 1 previous segment exists)
- **THEN** the translation prompt SHALL include only segment 1 as a bilingual pair, without padding or placeholder entries

#### Scenario: Translation with failed previous translation
- **WHEN** translating segment N and segment N-1's translation to the target language failed
- **THEN** the context entry for segment N-1 SHALL include only its source text (no target line), and the remaining context entries SHALL include full bilingual pairs as normal

#### Scenario: Per-target-language context selection
- **WHEN** translating segment N to Vietnamese, and previous segments have translations in both Vietnamese and Chinese
- **THEN** the context SHALL include previous Vietnamese translations (not Chinese) as the target-language anchors

## ADDED Requirements

### Requirement: Bilingual context storage
The system SHALL store completed translation results alongside their source segments in the context window. Each context entry SHALL contain the source segment text, speaker label, detected language, and a dictionary of completed translations keyed by target language code. The context window SHALL hold a maximum of 4 entries (3 previous + 1 current segment).

#### Scenario: Translation result stored for context
- **WHEN** segment N's translation to English completes successfully
- **THEN** the context entry for segment N SHALL be updated with the English translation text, making it available as bilingual context for segment N+1's translation

#### Scenario: Multiple target translations stored
- **WHEN** segment N is translated to both Vietnamese and Chinese
- **THEN** the context entry for segment N SHALL contain both translations, and each subsequent translation prompt SHALL use the translation matching its own target language

### Requirement: Structured bilingual prompt format
The translation prompt SHALL use a structured format that presents previous exchanges as labeled bilingual pairs with speaker attribution. The system message SHALL specify both source and target language names. The prompt SHALL instruct the model to output ONLY the translation with no additional text. The prompt SHALL NOT use chain-of-thought or multi-step reasoning instructions.

#### Scenario: Prompt format with full context
- **WHEN** building a translation prompt from Japanese to English with 3 context entries
- **THEN** the system message SHALL follow this structure: role instruction with source/target languages, followed by previous exchanges showing `[Speaker] {source_lang}: {source_text}` and `[Speaker] {target_lang}: {translation}` for each context entry, followed by a "Translate:" directive, with the current segment text as the user message

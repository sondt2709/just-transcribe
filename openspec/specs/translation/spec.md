## ADDED Requirements

### Requirement: Automatic translation trigger
The system SHALL automatically translate a transcription segment when its detected language differs from the user's configured preferred language. Translation SHALL be asynchronous and non-blocking — the original segment is emitted immediately, translation arrives as a follow-up event. Translation is a core comprehension feature: the total latency from speech to translated text on screen SHALL be within 5 seconds.

#### Scenario: Segment language differs from preferred
- **WHEN** a segment with `lang: "vi"` is emitted and the user's preferred language is "en"
- **THEN** the system SHALL asynchronously send the segment text to the LLM for translation to English

#### Scenario: Segment language matches preferred
- **WHEN** a segment with `lang: "en"` is emitted and the user's preferred language is "en"
- **THEN** no translation request SHALL be made

### Requirement: OpenAI-compatible LLM API for translation
The system SHALL call an OpenAI-compatible chat completions endpoint (`/v1/chat/completions`) for translation. The API base URL, model name, and API key SHALL be user-configurable.

#### Scenario: Successful translation
- **WHEN** the LLM API returns a translation response
- **THEN** the system emits a `translate` event via WebSocket with the segment ID, translated text, and target language

#### Scenario: LLM API unavailable
- **WHEN** the LLM API request fails or times out
- **THEN** the system SHALL emit an error event and continue transcription without translation — translation failure SHALL NOT block the pipeline

### Requirement: Translation context window
The system SHALL include up to 3 preceding segments as context in the translation prompt to improve coherence (e.g., pronoun resolution, topic continuity).

#### Scenario: Translation with prior context
- **WHEN** translating segment N
- **THEN** the translation prompt SHALL include segments N-3 through N-1 (or fewer if conversation just started) as context for the LLM

### Requirement: Translation latency budget
The total time from speech to translated text appearing on screen SHALL NOT exceed 5 seconds under normal conditions (transcription 0.5-2s + LLM API 1-3s). If the LLM API response exceeds 5 seconds, the translation SHALL still be displayed when it arrives — it SHALL NOT be discarded.

#### Scenario: Translation within latency budget
- **WHEN** the LLM API responds within 3 seconds
- **THEN** the translated text appears on screen within 5 seconds of the original speech

#### Scenario: Translation exceeds latency budget
- **WHEN** the LLM API response takes longer than 3 seconds
- **THEN** the translation SHALL still be displayed when it arrives, with no visual indication of being "late"

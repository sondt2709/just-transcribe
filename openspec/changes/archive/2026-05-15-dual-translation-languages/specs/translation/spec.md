## MODIFIED Requirements

### Requirement: Automatic translation trigger
The system SHALL automatically translate a transcription segment when its detected language differs from any of the user's configured target languages (`preferred_language` and optionally `preferred_language_2`). Translation SHALL be asynchronous and non-blocking — the original segment is emitted immediately, translations arrive as follow-up events. Each target language SHALL be evaluated independently for skip/translate. The total latency from speech to translated text on screen SHALL be within 5 seconds per translation.

#### Scenario: Segment language differs from both targets
- **WHEN** a segment with `lang: "en"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL asynchronously send two parallel translation requests: one to Vietnamese and one to Chinese

#### Scenario: Segment language matches one target
- **WHEN** a segment with `lang: "vi"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL skip the Vietnamese translation and only translate to Chinese

#### Scenario: Segment language matches sole configured target
- **WHEN** a segment with `lang: "en"` is emitted and `preferred_language` is "en" and `preferred_language_2` is empty
- **THEN** no translation request SHALL be made

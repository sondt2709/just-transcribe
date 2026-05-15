## ADDED Requirements

### Requirement: Multi-target translation dispatch
The system SHALL translate each transcript segment into up to two target languages simultaneously. When both `preferred_language` and `preferred_language_2` are configured, the system SHALL dispatch both translation requests concurrently via `asyncio.gather`. Each translation SHALL be an independent LLM call — failure of one SHALL NOT affect the other.

#### Scenario: Both translation languages configured
- **WHEN** a segment with `lang: "en"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL dispatch two parallel LLM translation calls: one to Vietnamese and one to Chinese

#### Scenario: Only primary language configured
- **WHEN** a segment is emitted and `preferred_language` is "vi" and `preferred_language_2` is empty
- **THEN** the system SHALL dispatch only one LLM translation call to Vietnamese (current behavior)

#### Scenario: One translation fails
- **WHEN** two translations are dispatched and the Vietnamese translation succeeds but the Chinese translation fails
- **THEN** the system SHALL emit the Vietnamese translation event and log a warning for the Chinese failure

### Requirement: Smart skip when target matches detected language
The system SHALL skip translation for any target language that matches the segment's detected language. This applies independently to each target.

#### Scenario: Detected language matches primary target
- **WHEN** a segment with `lang: "vi"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL skip the Vietnamese translation and only translate to Chinese

#### Scenario: Detected language matches secondary target
- **WHEN** a segment with `lang: "zh"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "zh"
- **THEN** the system SHALL skip the Chinese translation and only translate to Vietnamese

#### Scenario: Detected language matches both targets
- **WHEN** a segment with `lang: "vi"` is emitted and `preferred_language` is "vi" and `preferred_language_2` is "vi"
- **THEN** the system SHALL skip all translations (no LLM calls made)

### Requirement: Translation event carries target language
Each WebSocket `translate` event SHALL include a `target_lang` field identifying which language the translation is in. The event format SHALL be: `{type: "translate", id: <segment_id>, text: <translated_text>, target_lang: <language_code>}`.

#### Scenario: Two translations emitted for one segment
- **WHEN** a segment is translated into both Vietnamese and Chinese
- **THEN** two separate `translate` events SHALL be emitted: one with `target_lang: "vi"` and one with `target_lang: "zh"`

### Requirement: Frontend displays multiple translations per segment
The transcript UI SHALL display up to two translation boxes per segment, each labeled with its target language code. Translations SHALL be stacked vertically beneath the original text. When only one translation is present, only one box SHALL be shown.

#### Scenario: Two translations displayed
- **WHEN** a segment has translations for both Vietnamese and Chinese
- **THEN** the UI SHALL show two labeled translation boxes stacked beneath the original text

#### Scenario: One translation displayed
- **WHEN** a segment has a translation for Vietnamese only
- **THEN** the UI SHALL show one labeled translation box beneath the original text

#### Scenario: No translations
- **WHEN** a segment has no translations (detected language matches all targets or translation is unconfigured)
- **THEN** no translation boxes SHALL be shown beneath the original text

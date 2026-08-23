# mobile-vad (delta)

## MODIFIED Requirements

### Requirement: Utterance segmentation
The system SHALL turn the detector's per-frame booleans into discrete speech segments using the same timing as the desktop pipeline: minimum speech 0.25s, minimum silence 1.0s to end a segment, and maximum speech 15s with force-emit.

#### Scenario: Speech onset
- **WHEN** the detector reports speech and no segment is currently accumulating
- **THEN** the system SHALL begin accumulating audio (including a short pre-roll so the word onset is not clipped) and record the start time

#### Scenario: Segment finalized on silence
- **WHEN** 1.0s of continuous silence elapses while a segment is accumulating
- **THEN** the system SHALL emit the accumulated audio as a `SpeechSegment` with start time, end time, and concatenated PCM samples, provided it is at least 0.25s long

#### Scenario: Segment too short discarded
- **WHEN** a segment ended by silence is shorter than 0.25s
- **THEN** the system SHALL discard it without emitting

#### Scenario: Force-emit on maximum duration
- **WHEN** an accumulating segment reaches 15s without a silence break
- **THEN** the system SHALL force-emit the accumulated audio as a segment and begin a new accumulation

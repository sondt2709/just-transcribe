# kmp-transcript-history

## Purpose

Conversation persistence in the KMP Android app: the transcript survives process death, can be resumed with consistent segment ids and translation context, and is discarded on an explicit fresh start.

## Requirements

### Requirement: Transcript persists across process restarts
The app SHALL persist the current conversation's segments and translations to local storage as they change (debounced), so the conversation survives app close or process death.

#### Scenario: Process death mid-session
- **WHEN** the process is killed while or after recording
- **THEN** on next launch the persisted snapshot contains all segments and translations finalized more than the debounce interval before the kill

#### Scenario: Stop flushes
- **WHEN** the user stops recording
- **THEN** the snapshot on disk matches the on-screen transcript exactly

### Requirement: Restore rebuilds pipeline state consistently
Restoring a snapshot SHALL repopulate segments and translations in the UI state, seed the ASR segment id counter above the highest restored id, and re-seed the translation context with the most recent restored segments.

#### Scenario: Ids stay unique after resume
- **WHEN** a snapshot with max segment id 7 is restored and recording continues
- **THEN** the next transcribed segment receives id 8

#### Scenario: Translation context continuity
- **WHEN** recording continues after a restore
- **THEN** translation requests include the restored trailing segments as conversation context

### Requirement: Starting fresh discards history
Starting a new conversation from an empty screen, or clearing, SHALL delete the persisted snapshot.

#### Scenario: New conversation overwrites old history
- **WHEN** the user starts a new recording instead of resuming
- **THEN** the old snapshot is deleted and subsequent persistence reflects only the new conversation

### Requirement: Start does not reset segment ids
`PipelineController.start()` SHALL NOT reset the segment id counter; the counter resets only on idle clear or fresh-start. Stopping and restarting within one on-screen conversation SHALL continue appending with increasing ids.

#### Scenario: Stop then record again in-session
- **WHEN** the user stops (list showing ids 1..4) and taps record again without clearing
- **THEN** new segments continue from id 5 and no list key collisions occur

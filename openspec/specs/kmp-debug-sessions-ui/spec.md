# kmp-debug-sessions-ui

## Purpose

Defines requirements for the in-app debug sessions experience on Android: browsing recorded session traces, viewing important events, playing captured audio, exporting sessions via the share sheet, and automatic storage retention.

## Requirements

### Requirement: Debug sessions list
The app SHALL provide a "Debug sessions" screen reachable from Settings. It SHALL list recorded sessions newest-first, each row showing start time, duration, event count, error and stall badges when present, and on-disk size. The screen SHALL show total storage used by all sessions. Session parsing SHALL happen off the main thread.

#### Scenario: Sessions listed after recording
- **WHEN** the user records two sessions and opens the debug sessions screen
- **THEN** both sessions appear newest-first with their metadata

#### Scenario: Session with errors badged
- **WHEN** a listed session's trace contains `asr_error` or `stall` events
- **THEN** its row shows corresponding badges

### Requirement: Session event view
Opening a session SHALL show its important events as a chronological list without filter controls: session start/end, capture errors, VAD speech start/end, segments, final ASR calls and results/errors, translation calls and results/errors, and stalls. Final ASR results SHALL show the transcribed text. Interim ASR call/result events SHALL be collapsed into a summary count, but interim ASR errors SHALL be listed. Heartbeat events SHALL NOT be listed individually; they SHALL be summarized in one line (count and maximum inter-beat gap). Each row SHALL show absolute wall-clock time, an event-type chip, and a one-line summary; tapping a row SHALL expand its full JSON. Events referencing a WAV file SHALL offer inline playback only when the file still exists on disk, with at most one playing at a time.

#### Scenario: Important events shown, heartbeats summarized
- **WHEN** the user opens a session whose trace has 300 heartbeats, 5 segments, and 1 stall
- **THEN** the list shows the segment/ASR/translation/stall events chronologically and a single heartbeat summary line, not 300 heartbeat rows

#### Scenario: Playing captured audio
- **WHEN** `debugAudio` was on and the user taps play on a segment event with a WAV
- **THEN** that WAV plays; starting another playback stops the first

### Requirement: Session export via share sheet
The app SHALL let the user share any session from the list. Sharing SHALL zip the entire session directory (events plus any WAV files) and offer it through the Android share sheet using a `FileProvider` content URI, requiring no storage permissions. Zip creation SHALL run off the main thread.

#### Scenario: Exporting a session
- **WHEN** the user taps share on a session row
- **THEN** the system share sheet opens with a zip named after the session containing `events.jsonl` and any WAVs

### Requirement: Debug audio bulk delete
Because debug WAVs dominate storage, the debug sessions screen SHALL offer a "delete all debug audio" action (shown with the audio storage size, behind a confirmation) that removes every WAV from every session while keeping all trace logs.

#### Scenario: Freeing audio storage
- **WHEN** sessions hold debug WAVs and the user confirms "delete all debug audio"
- **THEN** all WAV files are deleted, `events.jsonl` files remain, and the affected events no longer offer playback

### Requirement: Automatic daily retention
The app SHALL delete session directories automatically with no manual session cleanup UI. On the first storage access of each calendar day (session start or debug screen open), all session directories from previous days SHALL be deleted; all of the current day's sessions SHALL be kept. The last-cleanup day SHALL be persisted in Preferences DataStore so cleanup runs at most once per day.

#### Scenario: Old sessions removed on first access of a new day
- **WHEN** sessions exist from yesterday and the user starts a recording (or opens the debug screen) today for the first time
- **THEN** yesterday's session directories are deleted and today's cleanup day is persisted

#### Scenario: Same-day sessions retained
- **WHEN** the user records five sessions today and cleanup runs again today
- **THEN** all five sessions remain

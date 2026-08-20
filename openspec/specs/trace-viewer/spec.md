# trace-viewer

## Purpose

TBD — Defines requirements for the debug trace viewer: backend APIs for listing sessions, fetching events, and serving segment audio, plus a renderer UI for inspecting events, reading transcripts, and playing back recorded audio.

## Requirements

### Requirement: Session listing API
The backend SHALL expose `GET /api/sessions` returning trace sessions (newest first) with per-session metadata: name, event count, duration in seconds, stall count, error count, WAV file count, and total size in bytes. Sessions unreadable or empty SHALL be skipped, not fail the listing.

#### Scenario: List sessions
- **WHEN** the client requests `GET /api/sessions` and three session directories exist
- **THEN** the response contains three entries, newest first, each with name, event_count, duration_s, stalls, errors, wav_count, size_bytes

### Requirement: Session events API
The backend SHALL expose `GET /api/sessions/{name}/events` returning the session's parsed events as a JSON array in file order. An optional `types` query parameter SHALL filter events: comma-separated type names include only those types; a `-` prefix (e.g. `types=-heartbeat`) excludes the named types. Unparseable lines SHALL be skipped. Unknown session names SHALL return 404.

#### Scenario: Fetch all events
- **WHEN** the client requests events for an existing session
- **THEN** every valid JSONL line is returned as a JSON object in order

#### Scenario: Exclude heartbeats
- **WHEN** the client requests `?types=-heartbeat`
- **THEN** the response contains all events except heartbeat events

#### Scenario: Invalid session name
- **WHEN** the client requests events for `../../etc` or a non-existent name
- **THEN** the server responds 404 without touching paths outside the sessions directory

### Requirement: Session audio API
The backend SHALL expose `GET /api/sessions/{name}/audio/{filename}` serving WAV files from the session's `segments/` directory with content type `audio/wav`. The filename MUST resolve inside that directory and end in `.wav`; anything else SHALL return 404.

#### Scenario: Play a segment WAV
- **WHEN** the client requests an existing WAV referenced by an `asr_call` event's `wav` field
- **THEN** the server streams the file with content type `audio/wav`

#### Scenario: Path traversal blocked
- **WHEN** the client requests `filename=../../config.toml`
- **THEN** the server responds 404

### Requirement: Trace viewer UI
The renderer SHALL provide a trace viewer opened via a "Debug Sessions" button in Settings → Debugging. It SHALL show the session list with metadata and stall/error badges, and for a selected session an event table (time, color-coded type, source, key-field summary) where a row click expands the full event JSON. It SHALL provide event-type filtering, free-text search, and a refresh action. Heartbeat events SHALL be hidden by default behind a toggle. A summary header SHALL show event totals, ASR latency p50/max, translation ok/error counts, and stall count computed from all events regardless of active filters.

#### Scenario: Inspect a session
- **WHEN** the user opens the viewer and selects a session
- **THEN** the event table renders with heartbeats hidden, and the summary header shows totals and latency stats

#### Scenario: Filter and expand
- **WHEN** the user enables only `stall` and `asr_done` types and clicks a row
- **THEN** the table shows only those events and the clicked row expands to pretty-printed JSON

#### Scenario: Text search
- **WHEN** the user types text into the search box
- **THEN** only events whose serialized JSON contains the text (case-insensitive) remain visible

### Requirement: Transcript view
The viewer SHALL offer a Transcript view for the selected session (toggle between Events and Transcript). It SHALL reconstruct the conversation from final ASR events: one row per final `asr_done` with text, showing relative time, speaker label (You/Others from source), detected language, and the transcribed text. Translations from `translate_done` events SHALL appear under their segment (matched by trace_id), and segments suppressed by dedup SHALL be visibly marked. When the segment's WAV exists (matched from the final `asr_call`'s `wav` field), the row SHALL include an inline audio player.

#### Scenario: Read the conversation
- **WHEN** the user switches the selected session to Transcript view
- **THEN** final segments render in order with speaker, language, text, and translations beneath

#### Scenario: Play a segment from the transcript
- **WHEN** debug_audio was enabled for the session and a transcript row has a recorded WAV
- **THEN** the row shows an audio player that plays that segment's audio

#### Scenario: Dedup-suppressed segment marked
- **WHEN** a final segment was dropped as a cross-source duplicate
- **THEN** the transcript row is shown struck-through/dimmed with a "dedup" marker

### Requirement: Inline audio playback
For any displayed event carrying a `wav` field (and for `stall` events' `ring_dumps` entries), the expanded row SHALL render a native audio player sourced from the session audio API, so the user can listen to the exact audio without leaving the app.

#### Scenario: Listen to a transcribed segment
- **WHEN** the user expands an `asr_call` event that has a `wav` path
- **THEN** an audio player is shown and plays that WAV when started

#### Scenario: Event without audio
- **WHEN** the user expands an event with no `wav` field
- **THEN** no audio player is rendered for it

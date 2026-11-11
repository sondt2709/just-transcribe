# speak-translation Specification

## Purpose
TBD - created by archiving change speak-translation. Update Purpose after archive.
## Requirements
### Requirement: Translate and speak typed text
The Speak section SHALL be in the right sidebar, below the recording controls and the Summary toggle. The user SHALL be able to collapse and expand it (remembered per window), and the sidebar SHALL scroll when the section does not fit. While an utterance is queued or playing, a "Now playing" line with Stop SHALL stay visible even when the section is collapsed. The history SHALL show the newest utterance first. The Speak section SHALL let the user type text, select a target language (`tts_target_lang`), and click "Translate & Speak" (or press ⌘↩). With "Translate first" on (default), the system SHALL translate the text to the target language with the translation LLM, then say the translation. With "Translate first" off, the system SHALL say the text as typed. The translation SHALL use the original text only and SHALL NOT use the transcript context.

#### Scenario: Typed Vietnamese said in English
- **WHEN** the target language is `en` and the user types "Chúng tôi sẽ gửi bản beta vào thứ Sáu" and clicks "Translate & Speak"
- **THEN** the history shows the original and its English translation, and the English text is played on the output device

#### Scenario: Translate first off
- **WHEN** "Translate first" is off and the user speaks "Hello team"
- **THEN** no LLM request is sent and "Hello team" is played

#### Scenario: LLM not configured
- **WHEN** "Translate first" is on and `llm_model` is empty
- **THEN** the utterance status becomes `error` with the message `LLM not configured` and nothing is played

### Requirement: Speak buttons on lines and answers
Each transcript line with the speaker `You` and each suggested answer in the summary panel SHALL have a speak button. The button SHALL translate the text to the target language and say it.

#### Scenario: Speak a suggested answer
- **WHEN** the user clicks the speak button of the suggested answer "Không, SSO sẽ không có trong bản beta này." with target `en`
- **THEN** the system says the English translation of the answer

#### Scenario: No speak button on Others lines
- **WHEN** a transcript line has the speaker `Others`
- **THEN** the line has no speak button

### Requirement: Speak my speech
When `tts_speak_mic` is on, the system SHALL translate each final `You` segment to the target language and say it, in segment order. Segments that are already in the target language SHALL be said without translation. The setting SHALL be toggled from the Speak section and saved in `config.toml`.

#### Scenario: Own speech is translated and said
- **WHEN** `tts_speak_mic` is on, the target is `en`, and the user says a Vietnamese sentence into the mic
- **THEN** after the `You` segment is final, its English translation is played

#### Scenario: Off by default
- **WHEN** `config.toml` has no `tts_speak_mic`
- **THEN** `You` segments are not spoken

### Requirement: TTS engines with fallback
The system SHALL support the TTS engines `system` (macOS `say` voices, default), `qwen_local` (Qwen3-TTS through mlx-audio, model `tts_qwen_model`) and `qwen_remote` (an OpenAI-compatible `POST /v1/audio/speech` at `tts_remote_url`). The `system` engine SHALL use `tts_system_voice`. When that is empty, it SHALL use the first installed voice whose locale matches the target language. With a Qwen engine and `tts_fallback_system` on (default), a target language that is not in the Qwen language list (`en, zh, ja, ko, de, fr, ru, pt, es, it`) SHALL use the `system` engine. The `speak` event SHALL name the engine that was used.

#### Scenario: Default engine needs no download
- **WHEN** a new user with no Qwen3-TTS model speaks text with target `vi`
- **THEN** the system plays it with the macOS voice `Linh`

#### Scenario: Qwen for a listed language
- **WHEN** `tts_engine = "qwen_local"` and the target is `en`
- **THEN** the audio comes from Qwen3-TTS with the voice `tts_qwen_voice` and language `english`

#### Scenario: Fallback for Vietnamese
- **WHEN** `tts_engine = "qwen_local"`, `tts_fallback_system = true`, and the target is `vi`
- **THEN** the system uses the macOS voice and the event reports `engine: "system"`

#### Scenario: Fallback off
- **WHEN** `tts_engine = "qwen_local"`, `tts_fallback_system = false`, and the target is `vi`
- **THEN** the system uses Qwen3-TTS with language `auto`

#### Scenario: Qwen model not downloaded
- **WHEN** `tts_engine = "qwen_local"` and the model is not in the HuggingFace cache
- **THEN** the utterance fails with the error `Qwen3-TTS model not downloaded` and the Speak section links to the download in Settings

### Requirement: Playback queue
The system SHALL play one utterance at a time, in request order. "Stop" SHALL stop the current sound at once and drop the queued utterances. The system SHALL keep the audio of the last 20 utterances in memory, and "Replay" SHALL play one again without a new translation or synthesis.

#### Scenario: Two requests in a row
- **WHEN** the user sends two texts quickly
- **THEN** the second is played after the first ends, never at the same time

#### Scenario: Stop
- **WHEN** an utterance is playing and one is queued, and the user clicks Stop
- **THEN** the sound stops, the queued one gets status `stopped`, and nothing else plays

#### Scenario: Replay
- **WHEN** the user clicks Replay on a history item
- **THEN** the same audio plays again and no LLM or TTS request is sent

### Requirement: Output device
The user SHALL be able to select the output device for spoken audio in Settings (`tts_output_device`, stored by name; empty = system default). If the saved device is not connected at play time, the system SHALL use the system default.

#### Scenario: Send voice into a call
- **WHEN** `tts_output_device = "BlackHole 2ch"` and that device exists
- **THEN** spoken audio is written to "BlackHole 2ch" and not to the speakers

#### Scenario: Device missing
- **WHEN** the saved device is not connected
- **THEN** the audio plays on the system default output

#### Scenario: Device list changed
- **WHEN** opening the output stream fails with a PortAudio error and no mic stream is open
- **THEN** the system reloads PortAudio and tries once more; when a mic stream is open, the utterance fails with a message to stop and start recording

### Requirement: The app does not transcribe its own voice
The system SHALL start `audiotee` with `--exclude-processes <backend PID>`, so the system-audio capture does not contain the spoken audio. The system SHALL drop each mic segment whose time span overlaps a playback, extended by 0.8 seconds after the playback ends, and SHALL trace it as `mic_gated` with reason `tts_playback`. The check SHALL use the segment's start and end times, because a segment becomes final only after the silence that follows it.

#### Scenario: Spoken audio is not in the transcript
- **WHEN** recording with speaker capture on and the app says "We can ship the beta on Friday"
- **THEN** no transcript segment contains that sentence

#### Scenario: Mic echo gated
- **WHEN** the app plays audio on the laptop speakers while the mic is recording
- **THEN** mic segments during playback are dropped and traced with reason `tts_playback`

#### Scenario: Echo segment that becomes final after the release window
- **WHEN** the mic hears the end of a playback and its segment becomes final 1 second after the playback ends
- **THEN** the segment is dropped, because its time span overlaps the playback

### Requirement: Qwen3-TTS model download
Settings SHALL show whether the Qwen3-TTS model is downloaded. A "Download" button SHALL download `tts_qwen_model` into the HuggingFace cache in the background, and SHALL show the progress as downloaded size against the expected size. The download SHALL NOT block other features.

#### Scenario: Download from Settings
- **WHEN** the model is missing and the user clicks Download
- **THEN** `GET /api/tts/status` reports `downloading: true` with a growing `downloaded_bytes`, and then `downloaded: true`

### Requirement: Speak API and events
The backend SHALL provide `POST /api/speak` (`{text, translate, target_lang?, source_lang?}`, returns the utterance `id`), `POST /api/speak/stop`, `POST /api/speak/replay` (`{id}`), `GET /api/tts/status`, `GET /api/tts/voices` (system voices with locale), `GET /api/tts/devices` (output device names) and `POST /api/tts/download`. It SHALL broadcast `{"type": "speak", id, status, original, text, lang, engine, error}` on each status change: `queued`, `synthesizing`, `playing`, `done`, `error`, `stopped`.

#### Scenario: Status sequence
- **WHEN** a speak request succeeds
- **THEN** the clients receive `queued`, `synthesizing`, `playing` and `done` for its `id`, in this order


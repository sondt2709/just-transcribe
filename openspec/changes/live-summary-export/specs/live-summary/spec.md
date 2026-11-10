## ADDED Requirements

### Requirement: Summary uses the translation LLM
The system SHALL generate the summary with the OpenAI-compatible chat completions endpoint and model configured for translation (`llm_api_base`, `llm_model`, `llm_api_key`). When `llm_api_base` or `llm_model` is empty, the system SHALL NOT start automatic summaries, and a manual run SHALL fail with the error `LLM not configured`.

#### Scenario: Summary call uses translation settings
- **WHEN** a summary run starts with `llm_api_base = "https://llm.example"` and `llm_model = "m1"`
- **THEN** the system sends `POST https://llm.example/v1/chat/completions` with `"model": "m1"`

#### Scenario: LLM not configured
- **WHEN** `llm_model` is empty and the user clicks "Summarize now"
- **THEN** the summary status becomes `error` with the message `LLM not configured` and no HTTP request is sent

### Requirement: Summary trigger modes
The system SHALL support the trigger modes `auto` and `manual`, set by `summary_mode`. In `auto` mode, each final segment SHALL restart a timer of `summary_debounce_s` seconds. When the timer fires, the system SHALL start a run only if at least `summary_min_segments` final segments arrived since the last successful summary. A manual run (`POST /api/summary/run`) SHALL start at once in both modes, with no minimum segment count. The system SHALL NOT run two summaries in parallel. A trigger during a run SHALL cause exactly one more run after the current run ends.

#### Scenario: Auto run after silence
- **WHEN** `summary_mode = "auto"`, `summary_debounce_s = 10`, `summary_min_segments = 2`, and 3 new final segments arrive with no further segment for 10 seconds
- **THEN** one summary run starts

#### Scenario: Debounce restarts on new speech
- **WHEN** a new final segment arrives 6 seconds after the previous one in `auto` mode with `summary_debounce_s = 10`
- **THEN** no run starts until 10 seconds after the latest segment

#### Scenario: Too few new segments
- **WHEN** the debounce timer fires and only 1 new segment exists with `summary_min_segments = 2`
- **THEN** no run starts

#### Scenario: Manual mode
- **WHEN** `summary_mode = "manual"` and new segments arrive
- **THEN** no run starts until the user clicks "Summarize now"

#### Scenario: Trigger during a run
- **WHEN** a summary run is in progress and the debounce timer fires again
- **THEN** the system starts one more run after the current run ends, and never two at the same time

### Requirement: Summary input is original text with a sliding window
The summary input SHALL contain only the original segment text, one line per segment, formatted as `[HH:MM:SS] <speaker>: <text>` with the local wall-clock time. `<speaker>` is `You` or `Others`. Translations SHALL NOT be included. When no previous summary exists and the transcript spans `summary_window_s` seconds or less, the input SHALL be the full transcript. When a previous summary exists, the input SHALL contain the previous summary, then the already-summarized segments from the last `summary_overlap_s` seconds before the first new segment, then the new segments. When the new segments span more than `summary_window_s` seconds, the system SHALL summarize them in sequential windows of at most `summary_window_s` seconds, and each window SHALL use the result of the window before it as the previous summary.

#### Scenario: Translations excluded
- **WHEN** a segment has the text "Hello" and the translation `vi: "Xin chào"`
- **THEN** the summary input contains "Hello" and does not contain "Xin chào"

#### Scenario: Short transcript sent in full
- **WHEN** no summary exists and the transcript spans 4 minutes with `summary_window_s = 600`
- **THEN** the input contains every segment and no "Summary so far" part

#### Scenario: Rolling update with overlap
- **WHEN** a previous summary exists, `summary_overlap_s = 60`, and 5 new segments arrived
- **THEN** the input contains the previous summary, the summarized segments from the 60 seconds before the first new segment, and the 5 new segments, and no older segments

#### Scenario: Long backlog in windows
- **WHEN** no summary exists, the transcript spans 25 minutes, `summary_window_s = 600`, and the user clicks "Summarize now"
- **THEN** the system makes 3 sequential LLM calls, and the final summary covers all 25 minutes

### Requirement: Editable prompt template with fixed output contract
The user prompt SHALL come from `summary_prompt`, or from the built-in default template when `summary_prompt` is empty. The system SHALL replace `{{content}}` with the summary input, `{{context}}` with the session context, and `{{language}}` with the English name of `preferred_language`. If the template has no `{{content}}`, the system SHALL add the input at the end. The system SHALL send a fixed system message. The message SHALL say that `You` is the user and `Others` is the other party, and it SHALL ask for JSON only with the fields `summary`, `items` (each with `type` in `info|action|question`, `speaker` in `You|Others`, and `text`), `next_actions` and `suggested_answers` (each with `for` and `answer`).

#### Scenario: Placeholders replaced
- **WHEN** the template is `Lang {{language}}. Ctx {{context}}. Content: {{content}}`, `preferred_language = "vi"`, and the context is "Sprint review"
- **THEN** the user message starts with `Lang Vietnamese. Ctx Sprint review. Content: ` followed by the summary input

#### Scenario: Template without content placeholder
- **WHEN** the template is `Summarize briefly.`
- **THEN** the user message is `Summarize briefly.` followed by the summary input

#### Scenario: Reset to default
- **WHEN** the user clicks "Reset to default" in the AI Summary settings and saves
- **THEN** `summary_prompt` is saved as empty and the built-in default template is used

### Requirement: Summary result parsing
The system SHALL parse the LLM reply as JSON after it removes Markdown code fences and any text outside the first `{` and the last `}`. Items with a `type` other than `info`, `action` or `question` SHALL be dropped. A `speaker` other than `You` SHALL be stored as `Others`. If the parse fails, the run SHALL fail, and the previous summary SHALL stay unchanged.

#### Scenario: JSON in code fences
- **WHEN** the LLM replies with "```json\n{...valid...}\n```"
- **THEN** the summary is parsed and stored

#### Scenario: Invalid reply
- **WHEN** the LLM replies with "Sorry, I cannot help"
- **THEN** the summary status becomes `error` and the previous summary is still returned by `GET /api/summary`

### Requirement: Session context in memory
The user SHALL be able to set a session context as text, or by loading a `.txt` or `.md` file into the text box in the summary panel. The system SHALL keep the context in backend memory only (`PUT /api/summary/context`). It SHALL NOT write the context to `config.toml` or any other file. The context SHALL stay after Clear, and it SHALL be empty after an app restart. Text longer than 20,000 characters SHALL be cut to 20,000 characters.

#### Scenario: Load a Markdown file
- **WHEN** the user clicks "Load file" and selects `agenda.md`
- **THEN** the context text box shows the file content, and the next summary prompt contains it in place of `{{context}}`

#### Scenario: Context is not persisted
- **WHEN** the user sets a context and the app restarts
- **THEN** the context is empty and `config.toml` does not contain the context text

### Requirement: Summary API and events
The backend SHALL provide `GET /api/summary`, which returns `{status, summary, updated_at, error, covered_segment_id, context}`. `status` SHALL be one of `idle`, `running`, `ok` or `error`. The backend SHALL provide `POST /api/summary/run` and `PUT /api/summary/context`. It SHALL broadcast a WebSocket event `{"type": "summary", ...}` with the same fields when a run starts and when it ends. Clearing the transcript SHALL reset the summary to `idle` with no content, and SHALL cancel a scheduled automatic run.

#### Scenario: Run broadcast
- **WHEN** a summary run starts and then ends with success
- **THEN** every connected window receives a `summary` event with `status: "running"` and then one with `status: "ok"` and the parsed summary

#### Scenario: Clear resets summary
- **WHEN** the user clears the transcript
- **THEN** `GET /api/summary` returns `status: "idle"` and `summary: null`

### Requirement: Summary panel
The main window SHALL show a summary panel that the user can show or hide with a "Summary" toggle. The panel SHALL show the status and the last update time, a "Summarize now" button, Copy and Export buttons, the session context box, and the 4 blocks: Summary, Items (each with a type label and the speaker), Next actions, and Suggested answers (each with a copy button).

#### Scenario: Panel renders the 4 blocks
- **WHEN** a summary with 1 info, 1 action and 1 question item, 2 next actions and 1 suggested answer arrives
- **THEN** the panel shows the summary text, the 3 items with their type labels and speakers, the 2 next actions, and the suggested answer

#### Scenario: Export summary
- **WHEN** the user clicks Export in the summary panel and saves as `meeting-summary.md`
- **THEN** the file contains the 4 blocks as Markdown headings `## Summary`, `## Items`, `## Next actions`, `## Suggested answers`

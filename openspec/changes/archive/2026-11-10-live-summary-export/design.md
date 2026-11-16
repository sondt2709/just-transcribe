## Context

The backend keeps the session transcript in `AppState.transcript` (`server.py`). Each entry has `id`, `text`, `speaker` (`You` for mic, `Others` for system audio), `lang`, `wall_start` and `translations`. `TranslationService` (`pipeline/translate.py`) calls an OpenAI-compatible `/v1/chat/completions` endpoint with `llm_api_base`, `llm_model` and `llm_api_key`. The renderer gets segments over `/ws/transcript`. It can copy the transcript to the clipboard (`lib/transcriptActions.ts`). It cannot save the transcript to a file.

A spike on 2026-11-11 sent a 5-line conversation to the configured `vllm-qwen` model. The model returned valid JSON with the 4 blocks in 4.24 s, with 542 total tokens.

## Goals / Non-Goals

**Goals:**
- A summary that updates during a call, with bounded prompt size for long calls.
- The same 4-block output every time, so the UI can render it.
- A user-editable prompt, and context that applies to one session only.
- Export the transcript and the summary to `.md` or `.txt`.

**Non-Goals:**
- Summary in the overlay window.
- Saving the summary or context on disk (apart from an explicit export).
- Summaries of old trace sessions.
- TTS (change `speak-translation`, issue #14).

## Decisions

### 1. The summary runs in the backend
`SummaryService` in `pipeline/summarize.py` owns the LLM call, the scheduler and the last summary. The backend sees every final segment, so it can schedule `auto` runs without a renderer. Both windows get the same result through the WebSocket event `summary`.
*Alternative:* summarize in the renderer. This was rejected because the overlay and the main window would run separate LLM calls.

### 2. Trigger: one debounce timer on final segments
`_on_segment` calls `SummaryService.notify_segment()`. In `auto` mode this restarts a timer of `summary_debounce_s` seconds (default 10). When the timer fires, a run starts only if at least `summary_min_segments` (default 2) segments are new since the last summary. A segment is final only after VAD detects silence, so this timer is the "VAD" trigger and the debounce trigger together. If a run is in progress, the service sets a `pending` flag and runs one more time after the current run, never in parallel. `POST /api/summary/run` starts a run at once in every mode, with no minimum segment count.

### 3. Sliding-window input, original text only
Each line is `[HH:MM:SS] You: <text>` or `[HH:MM:SS] Others: <text>`. The time comes from `wall_start` in local time. Translations are never sent.

- **Full mode:** when no previous summary exists and the transcript spans `summary_window_s` (default 600 s) or less, `{{content}}` is the full transcript.
- **Rolling mode:** when a previous summary exists, `{{content}}` has three parts:
  1. `Summary so far:` with the previous summary as JSON in the output shape. The system message tells the model to carry forward every earlier item, next action and suggested answer that is still relevant. (A real run showed that a plain-text summary made the model list only the new items.)
  2. `Earlier conversation (already summarized):` with the overlap, which is the summarized segments in the last `summary_overlap_s` seconds (default 60) before the first new segment.
  3. `New conversation:` with the new segments.
- **Backlog:** if the new segments span more than `summary_window_s` (for example, the first manual run after 30 minutes), the service summarizes them in sequential windows. Each window uses the rolling result of the window before it. Each window is one LLM call.

As a result, the prompt size has a limit: one window of new text, one overlap, and one summary.

*Alternative:* send the full transcript each time. This was rejected because the token cost grows without a limit.

### 4. Prompt = user template + fixed contract
The user template (`summary_prompt`; empty = built-in default) is the user message. `{{content}}`, `{{context}}` and `{{language}}` are replaced with plain string replacement. If the template has no `{{content}}`, the content is added at the end. `{{language}}` is the name of `preferred_language` (for example "Vietnamese"). The system message is fixed and app-owned:
- It says that `You` is the user and `Others` is the other party.
- It says to write all text in `{{language}}`.
- It says to return JSON only, with this schema: `{"summary": str, "items": [{"type": "info"|"action"|"question", "speaker": "You"|"Others", "text": str}], "next_actions": [str], "suggested_answers": [{"for": str, "answer": str}]}`.

The parser removes code fences and reads the text from the first `{` to the last `}`. It drops items with an unknown `type`, and it maps an unknown `speaker` to `Others`. If the parse fails, the run fails with an error and the service keeps the previous summary.
*Alternative:* `response_format: json_object`. This was rejected because not all OpenAI-compatible servers support it. A lenient parse works with all of them.

### 5. Context is in backend memory
`PUT /api/summary/context {text}` stores the text in `SummaryService.context`. The text is not saved to `config.toml`. "Load .txt/.md" in the panel reads the file in the renderer with `File.text()` and puts the content in the text box. The context lasts until the app restarts. It survives Clear, because a user often clears old lines before a meeting starts but keeps the agenda. Clear resets the summary and the summarized position. The context is capped at 20,000 characters.

### 6. Export through one IPC call
`window.api.saveTextFile({ defaultName, markdown, text })` opens `dialog.showSaveDialog` with the filters Markdown (`.md`) and Text (`.txt`). The main process writes `text` when the selected path ends with `.txt`. In all other cases it writes `markdown`. The renderer never sends a file path. As a result, the renderer cannot write to an arbitrary path. Formatters in `lib/exportFormat.ts` are pure functions with `node --test` tests. The transcript `.txt` format reuses `formatTranscriptText`.

### 7. UI placement
A `SummaryPanel` column (22rem) sits between the transcript and the controls sidebar. A "Summary" toggle in `Controls` shows or hides it, and `localStorage` remembers the choice (default: shown). Settings gets an "AI Summary" section with the mode, the debounce, the minimum segments, the window, the overlap, and the prompt textarea with "Reset to default".

## Risks / Trade-offs

- [The LLM returns invalid JSON] → Lenient parse; keep the last good summary; show the error in the panel status line.
- [`auto` mode puts load on the LLM server] → One run at a time, a debounce, and a minimum number of new segments. The user can select `manual`.
- [The summary lags behind the speech] → It is debounced on purpose. "Summarize now" gives the latest content at once.
- [Information is lost in rolling mode] → The overlap keeps local context. The previous summary carries the earlier content.
- [The LLM is not configured] → `notify_segment` does nothing. A run returns the error `LLM not configured`, and the panel shows a hint to configure Translation (LLM).

## Migration Plan

New config keys have defaults in `AppConfig.from_dict`, so old `config.toml` files load without change. Rollback: revert the PR. Unknown keys in `config.toml` are ignored, and they are dropped on the next save.

## Open Questions

None.

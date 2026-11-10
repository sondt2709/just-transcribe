## Why

In a long call, the user reads the transcript line by line to find what was decided and what they must answer. The app already has an LLM for translation, so it can keep a live summary with action items, open questions and suggested answers. Users also cannot save a transcript or a summary to a file today; they can only copy the transcript to the clipboard (issue #13).

## What Changes

- Add a live AI summary of the current transcript. It uses the same LLM endpoint and model as translation.
- The summary has 4 blocks: an overall summary; items classified as `info`, `action` or `question`, each with the speaker `You` or `Others`; next actions; suggested answers to questions or actions.
- Trigger modes: `auto` (summarize N seconds after the last final segment, when enough new segments exist) and `manual` (the "Summarize now" button). The button also works in `auto` mode.
- The summary input is the original text only. Translations are not sent.
- Long transcripts use a sliding window: when the transcript is longer than the window (default 10 minutes), the prompt contains the previous summary, an overlap of already-summarized segments, and the new segments.
- An editable prompt template in Settings with the placeholders `{{content}}`, `{{context}}` and `{{language}}`. The app adds a fixed JSON output rule so the UI can always render the 4 blocks.
- Session context: the user types text or loads a `.txt`/`.md` file in the summary panel. The context is kept in backend memory only. It is not written to `config.toml` and it is lost when the app restarts.
- A summary panel in the main window, with the 4 blocks, status, "Summarize now", Copy and Export.
- Export the transcript (original + translations) and the summary to a `.md` or `.txt` file through the macOS Save dialog.

## Capabilities

### New Capabilities
- `live-summary`: summary triggers, sliding-window input, prompt template, session context, JSON output contract, the backend API and events, and the summary panel with export.

### Modified Capabilities
- `transcript-actions`: add "Export transcript to a file" (Markdown and plain text) next to Copy and Clear.
- `app-config`: add the summary keys to `config.toml` (`summary_mode`, `summary_debounce_s`, `summary_min_segments`, `summary_window_s`, `summary_overlap_s`, `summary_prompt`).

## Impact

- Python: new `pipeline/summarize.py`; `server.py` (endpoints `GET /api/summary`, `POST /api/summary/run`, `PUT /api/summary/context`, WebSocket event `summary`, hooks in `_on_segment` and clear); `config.py` (new keys).
- Electron: new `SummaryPanel.tsx` and `lib/exportFormat.ts`; changes to `App.tsx`, `Controls.tsx`, `Settings.tsx`, `useTranscript.ts`; new IPC `save-text-file` in `main/index.ts` and `preload/index.ts`.
- LLM load: `auto` mode sends one chat completion per pause in the conversation to the configured `llm_api_base`.
- No new dependencies. No data migration: old `config.toml` files load with default values for the new keys.

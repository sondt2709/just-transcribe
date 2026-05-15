## 1. Teal Color Migration

- [x] 1.1 Replace all `blue-*` Tailwind classes with `teal-*` equivalents in Controls.tsx (start button, language chips)
- [x] 1.2 Replace all `blue-*` Tailwind classes with `teal-*` equivalents in Settings.tsx (save button, provider toggles, focus borders, inputClass)
- [x] 1.3 Replace all `blue-*` Tailwind classes with `teal-*` equivalents in Setup.tsx (provider cards, step indicators, run setup button)

## 2. Language Selector Updates

- [x] 2.1 Rename `ASR_LANGUAGES` labels in Controls.tsx from codes (EN, VI, ZH, YUE, JA, KO) to full names (English, Vietnamese, Chinese, Cantonese, Japanese, Korean)
- [x] 2.2 Change "Language" label to "Source language" in Controls.tsx

## 3. Settings Dialog Layout

- [x] 3.1 Move "Recognition Language" field above "Translation Language" in the Audio & Language section of Settings.tsx
- [x] 3.2 Swap LLM toggle order: Local (left, disabled+"soon") and Remote (right, active)

## 4. ASR Config Caching

- [x] 4.1 Add `localAsr` and `remoteAsr` state objects in Settings.tsx to cache each provider's values independently
- [x] 4.2 On config load, populate both cache objects from the flat config based on `asr_provider`
- [x] 4.3 On provider switch, swap displayed values from the cached state (no data loss)
- [x] 4.4 On save, write only the active provider's cached values to the flat config keys before sending to backend

## 5. LLM Test Connection Backend

- [x] 5.1 Add `POST /api/llm/test` endpoint in server.py that accepts `{ url, api_key }`, calls `GET {url}/v1/models`, and returns `{ ok, models }` or `{ ok, error }`
- [x] 5.2 Add 10-second timeout and error handling for unreachable servers and non-200 responses

## 6. LLM Settings UI Redesign

- [x] 6.1 Add `llmRemoteModels`, `llmTesting`, `llmTestStatus` state variables in Settings.tsx
- [x] 6.2 Add `testLlmRemote()` function mirroring `testRemote()` for ASR
- [x] 6.3 Replace LLM plain text inputs with the ASR-style UI: Server URL + Test button, API Key (optional), connection status badge, Model dropdown/fallback input
- [x] 6.4 Wire up test button to call `/api/llm/test` and populate model dropdown on success

## 7. Homebrew Cask

- [x] 7.1 Create `homebrew-just-transcribe` repo structure with `Casks/just-transcribe.rb` cask formula
- [x] 7.2 Add `zap` stanza for cleaning `~/.just-transcribe` and `~/Library/Application Support/just-transcribe`
- [x] 7.3 Update project README with `brew tap`/`brew install --cask` instructions

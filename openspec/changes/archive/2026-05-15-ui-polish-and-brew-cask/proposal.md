## Why

The app icon uses a teal gradient (#009688) but the UI accent color is Tailwind blue-500, creating a visual disconnect. The language selector uses cryptic 2-letter codes, the Settings dialog has inconsistent layouts between ASR and LLM sections, and switching ASR providers loses field values. Additionally, there's no Homebrew cask for easy installation.

## What Changes

- Replace all `blue-*` Tailwind classes with `teal-*` equivalents across Controls, Settings, and Setup components to match the app icon color
- Rename "Language" label to "Source language" in the right panel; change chip labels from codes (EN, VI, ZH...) to full names (English, Vietnamese, Chinese...)
- In Settings > Audio & Language: move "Recognition Language" field above "Translation Language"
- In Settings > Speech Recognition (ASR): cache local and remote config values independently so switching providers preserves each side's inputs
- In Settings > Translation (LLM): swap toggle order to Local (left, disabled+soon) / Remote (right); add test-connection flow with model discovery (Server URL, API Key optional, connection status, model dropdown) — matching the ASR remote UI pattern
- Add backend `POST /api/llm/test` endpoint for testing OpenAI-compatible LLM server connections and listing models
- Create a Homebrew tap (`homebrew-just-transcribe`) with a cask formula for arm64 DMG installation

## Capabilities

### New Capabilities
- `brew-cask`: Homebrew tap and cask formula for `brew install --cask just-transcribe`

### Modified Capabilities
- `app-config`: Add separate config keys for local vs remote ASR (asr_local_model, asr_remote_model, asr_remote_base_url, asr_remote_api_key); add LLM test endpoint
- `translation`: Add LLM connection test and model discovery via `/api/llm/test`

## Impact

- **Frontend**: Controls.tsx, Settings.tsx, Setup.tsx — color class replacements + layout changes
- **Backend**: config.py (new config keys with migration), server.py (new `/api/llm/test` endpoint)
- **Tailwind**: tailwind.config.js may optionally extend theme with custom primary color
- **Distribution**: New GitHub repo for Homebrew tap; CI workflow for updating cask on release
- **Config migration**: Existing `asr_model`/`asr_base_url`/`asr_api_key` must migrate to provider-specific keys without losing user data

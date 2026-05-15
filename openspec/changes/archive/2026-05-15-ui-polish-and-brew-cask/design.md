## Context

Just Transcribe is a macOS Electron app with a Python backend for real-time transcription. The UI uses Tailwind CSS with hardcoded `blue-*` classes, but the app icon is teal (#009688). The Settings dialog has inconsistent layouts between ASR (which has test-connection + model discovery) and LLM (which has plain text inputs). Switching ASR providers loses field values because config keys are shared. Distribution is DMG-only with no Homebrew support.

## Goals / Non-Goals

**Goals:**
- Consistent teal accent color matching the app icon across all interactive elements
- Clearer language selector with full names and "Source language" label
- Settings field reordering: Recognition Language above Translation Language
- Independent caching of local vs remote ASR config values during a session
- LLM remote section matches ASR remote UI pattern (test connection, model dropdown)
- Backend `/api/llm/test` endpoint for OpenAI-compatible server testing
- Homebrew tap with cask formula for arm64 DMG

**Non-Goals:**
- Custom Tailwind theme with semantic color tokens (just swap blue → teal)
- Local LLM support (remains disabled with "soon" badge)
- Intel (x64) builds
- Submitting to official homebrew-cask repo
- Auto-update via Homebrew (manual cask bump per release)

## Decisions

### D1: Swap Tailwind blue → teal directly, no custom theme
Replace `blue-500` → `teal-500`, `blue-400` → `teal-400`, `blue-600` → `teal-600`, `blue-500/20` → `teal-500/20`, `blue-500/30` → `teal-500/30`, `blue-500/10` → `teal-500/10` across Controls.tsx, Settings.tsx, Setup.tsx, and the `inputClass` focus border.

Tailwind's built-in `teal-500` (#14b8a6) and `teal-600` (#0d9488) are close enough to the icon's #009688. No need for a custom color in tailwind.config.js.

**Alternative considered**: Define a `primary` color in tailwind.config.js. Rejected because only 3 component files use the accent color — a semantic alias adds indirection without real benefit at this scale.

### D2: ASR config caching — frontend-only state, single backend config
Keep the backend config schema unchanged (`asr_model`, `asr_base_url`, `asr_api_key`). The frontend caches local and remote values in component state and writes only the active provider's values to the backend on save.

State shape:
```typescript
localAsr: { model: string }
remoteAsr: { base_url: string, api_key: string, model: string }
```

On load: populate both from the single config based on `asr_provider`.
On save: write the active provider's cached values to the flat config keys.

**Alternative considered**: Add separate backend config keys (`asr_local_model`, `asr_remote_model`, etc.). Rejected because it requires config migration and backend changes for a purely UI problem — the user only ever uses one provider at a time.

### D3: LLM test connection reuses the ASR test pattern
Add `POST /api/llm/test` that accepts `{ url, api_key }`, calls `GET /v1/models` on the target server, and returns `{ ok: true, models: [...] }` or `{ ok: false, error: "..." }`.

Frontend adds `testLlmRemote()` mirroring `testRemote()`, with `llmRemoteModels`, `llmTesting`, and `llmTestStatus` state. The LLM section gets the same UI flow: Server URL + Test button, API Key (optional), connection status badge, Model dropdown.

### D4: LLM toggle order — Local left, Remote right
Swap the two buttons so Local (disabled, "soon") is on the left and Remote (active) is on the right. This matches the ASR section layout where Local is always the left option.

### D5: Language chips — full names
Change `ASR_LANGUAGES` in Controls.tsx to use full names: Auto, English, Vietnamese, Chinese, Cantonese, Japanese, Korean. These will wrap to 2 rows in the right panel, which is acceptable — the panel has vertical space available.

### D6: Recognition Language field moves up
In Settings > Audio & Language, reorder fields to: Audio Sources → Recognition Language → Translation Language. Recognition Language is more frequently adjusted (users set it when auto-detect fails), so it should be more prominent.

### D7: Own Homebrew tap at `sondt/homebrew-just-transcribe`
Create a GitHub repo `homebrew-just-transcribe` containing `Casks/just-transcribe.rb`. Users install with:
```
brew tap sondt/just-transcribe
brew install --cask just-transcribe
```

The cask points to the GitHub release DMG URL. Version and SHA256 are updated manually or via a GitHub Action on release.

## Risks / Trade-offs

- **[Teal accessibility]** Teal on dark backgrounds has slightly lower contrast than blue for some users → The opacity variants (teal-500/20 bg with teal-400 text) maintain readable contrast ratios on neutral-900/950 backgrounds. Visually verified against WCAG AA for text sizes used (xs/sm).
- **[Language chip wrapping]** Full names cause 2-row wrap on the right panel → Acceptable; vertical space is available. If the panel is ever made narrower, chips can truncate with `truncate` class.
- **[LLM model discovery reliability]** Not all OpenAI-compatible servers implement `GET /v1/models` → Fallback: if model list fails, keep the text input so users can type the model name manually. Same pattern ASR already uses.
- **[Frontend-only ASR caching]** Cached values are lost on page reload since they're in React state → On reload, the config is re-fetched from backend (which has the last-saved values). Users only lose unsaved changes, which is expected behavior.

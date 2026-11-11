## Why

In a call with a person who speaks another language, the user can read the translated transcript, but cannot answer in that language. The live summary (change `live-summary-export`) already proposes answers in the user's language. The user needs the app to translate a typed text, a suggested answer, or their own speech, and say it in the other person's language (issue #14).

## What Changes

- Add a **Speak** tab next to Summary in the AI panel. The user types text in any language, selects the target language, and clicks "Translate & Speak". The tab shows "Now playing" with Stop, and a history with Replay.
- Add a speak button to each `You` transcript line and to each suggested answer.
- Add **Speak my speech**: when on, the app translates each final `You` segment to the target language and says it.
- Add two TTS engines:
  - **macOS voice** (default). It uses the system `say` voices, needs no download, and supports Vietnamese (`Linh`).
  - **Qwen3-TTS** (optional). It runs locally with mlx-audio (`mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`, 1.8 GB, downloaded only on request) or through a remote OpenAI-compatible `/v1/audio/speech` server (for example `mlx_audio.server`).
- With Qwen3-TTS, a language that the model does not list (for example Vietnamese) falls back to the macOS voice by default. A setting turns off the fallback.
- Playback goes to a selectable output device. The app excludes its own process from system-audio capture (`audiotee --exclude-processes <pid>`), and it gates the mic while it speaks, so its own voice is not transcribed.
- First install: the setup screen shows the Qwen3-TTS download as an optional step. Settings has a "Download" button with progress.

## Capabilities

### New Capabilities
- `speak-translation`: Speak tab, speak buttons, Speak my speech, translate-then-speak flow, TTS engines and fallback, playback queue and output device, self-capture prevention, model download, and the backend API and events.

### Modified Capabilities
- `app-config`: add the `tts_*` keys to `config.toml`.
- `setup-guide`: add the optional Qwen3-TTS model step.

## Impact

- Python: new `pipeline/tts.py`; `translate.py` (one-shot translation); `server.py` (endpoints `/api/tts/*`, `/api/speak*`, WebSocket event `speak`, Speak my speech hook); `orchestrator.py` (mic gate during playback); `audio/speaker.py` (audiotee exclude flag); `config.py`.
- Electron: new `SpeakPanel.tsx` and `AiPanel.tsx` (tabs); `Transcript.tsx` and `SummaryPanel.tsx` (speak buttons); `Settings.tsx` ("Voice (TTS)" section); `Setup.tsx` and `main/setup.ts` (optional model step).
- No new Python dependency: `mlx_audio.tts` loads in the current environment.
- Disk: 1.8 GB only when the user downloads Qwen3-TTS. Memory: the model loads lazily on the first Qwen3-TTS request.

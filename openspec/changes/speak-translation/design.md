## Context

The backend runs ASR, translation and summary. Mic audio comes from `sounddevice`. System audio comes from `audiotee`, a Core Audio process tap of all processes. `orchestrator.py` gates the mic while the speaker source has voice (half-duplex).

Spikes on 2026-11-11 (M-series Mac, files in the PR evidence):

| Engine | Text | Time | Remote Qwen3-ASR heard |
|---|---|---|---|
| Qwen3-TTS 0.6B CustomVoice 8-bit, `english`, voice `ryan` | "We can ship the beta on Friday, but single sign-on is not included." | load 38.9 s (first), generate 2.4–4.1 s for 5–7.7 s audio | "We can ship the beta on Friday, but single sign-on is not." |
| same model, `auto`, voice `vivian` | "Chúng tôi có thể phát hành bản beta vào thứ Sáu, nhưng chưa có đăng nhập một lần." | 1.4 s | "chúng tôi có thể phát **hàng bằng bế đã** vào thứ sáu nhưng chưa có **tăng nhiệt** một lần." |
| macOS `say -v Linh` | same Vietnamese text | 0.81 s | "chúng tôi có thể phát hành bản bi tờ vào thứ sáu, nhưng chưa có đăng nhập một lần." |

`codec_language_id` of every mlx Qwen3-TTS variant (0.6B/1.7B, Base, CustomVoice, VoiceDesign) lists: chinese, english, french, german, italian, japanese, korean, portuguese, russian, spanish (+ 2 Chinese dialects). It does not list Vietnamese.

## Goals / Non-Goals

**Goals:**
- Say a translated text in the other person's language with one click, or automatically for the user's own speech.
- Work with no download (macOS voice). Qwen3-TTS is optional.
- Never transcribe the app's own voice.

**Non-Goals:**
- Voice cloning of the user ("my voice" means the user's speech as input).
- Installing a virtual audio driver. The user selects an existing device (for example BlackHole) to send the voice into a call.
- Reading the other person's lines aloud to the user.
- Streaming playback while the audio is being generated. Each utterance is generated in full, then played.

## Decisions

### 1. Synthesis and playback run in the backend
`pipeline/tts.py` has `SpeechService` with one engine interface: `synthesize(text, lang) -> (float32 samples, sample_rate)`. Playback uses `sounddevice.OutputStream` in the backend process.
*Why:* The backend PID is then the only process that makes the sound, so `audiotee --exclude-processes <os.getpid()>` keeps it out of system-audio capture. If `say` played the sound directly, it would be a new process each time, and audiotee would capture it.
*Alternative:* play in the renderer with `HTMLAudioElement.setSinkId`. This was rejected because the Chromium audio service is a separate process whose PID the backend does not know.

### 2. Engines
- `system`: `say -v <voice> -o <tmp>.wav --file-format=WAVE --data-format=LEI16@22050 <text>`, then read the file with `soundfile`. The voice comes from `tts_system_voice`, or, when that is empty, the first voice of `say -v '?'` whose locale matches the target language (for example `vi_VN` → `Linh`). Voices are listed once and cached.
- `qwen_local`: `mlx_audio.tts.utils.load_model(tts_qwen_model)` loads lazily in a worker thread on first use, then `model.generate(text, voice=tts_qwen_voice, lang_code=<qwen language name or "auto">)`. One lock serializes generation.
- `qwen_remote`: `POST {tts_remote_url}/v1/audio/speech` with `{model, input, voice, lang_code, response_format: "wav"}` (the `mlx_audio.server` request shape), and an optional Bearer key.
- **Fallback:** with a Qwen engine and `tts_fallback_system = true`, a target language that is not in the Qwen list uses `system`. The speak event names the engine that was used.

### 3. Translate, then speak
`TranslationService.translate_once(text, target_lang)` makes one chat completion with no context window, using the translation LLM. The speak request skips translation when `translate` is false, or when the text is already in the target language: the LLM is told to return the text unchanged if it already is in the target language. Speak my speech uses the segment language as the source.

### 4. One queue, one utterance at a time
`SpeechService` keeps a FIFO queue. A worker synthesizes, then plays each item. `POST /api/speak/stop` stops the current sound and empties the queue. The last 20 utterances keep their audio in memory for Replay. Each state change broadcasts `{"type": "speak", id, status: queued|synthesizing|playing|done|error|stopped, original, text, lang, engine, error}`.

### 5. No feedback loop
1. Speaker source: `SpeakerCapture` starts audiotee with `--exclude-processes <backend pid>`.
2. Mic source: while a sound plays, and for 0.8 s after it ends, the orchestrator treats playback like speaker voice, so mic segments are gated (trace reason `tts_playback`). The gate stops the laptop speakers' echo into the mic. It also stops Speak my speech from speaking its own output again.

### 6. Output device
`tts_output_device` stores the device **name** (indexes change when devices connect). Empty = system default. At play time the name is resolved with `sd.query_devices()`. A missing device falls back to the default and logs a warning. The backend does not reload PortAudio for playback, because that would break an open mic stream.

### 7. Model download
`POST /api/tts/download` runs `huggingface_hub.snapshot_download(tts_qwen_model)` in a worker thread. `GET /api/tts/status` reports `downloading`, the bytes in the cache folder (for progress, against the 1.8 GB size), `downloaded`, `loaded`, `error`. On the first-install screen, the optional step shows `hf download mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit` (the same pattern as the ASR model) and does not block "ready".

### 8. UI
- The AI panel gets tabs **Summary | Speak** (the existing column, 22rem).
- The Speak tab has: target language, an engine/voice line with a link to Settings, a text box (⌘↩ = Translate & Speak), a "Translate first" toggle, the "Speak my speech" toggle, Now playing + Stop, and history with Replay and Copy.
- 🔊 buttons appear on `You` lines (on hover) and on suggested answers.
- Settings gets a "Voice (TTS)" section: engine (macOS voice / Qwen3-TTS local / Qwen3-TTS remote), voice, target language, output device, fallback toggle, the download button with progress, and the remote URL/key/model with Test.

## Risks / Trade-offs

- [The first Qwen3-TTS load takes about 39 s] → Load starts at once when the user selects the engine (warm-up). The status shows "Loading voice model…"; speak requests wait in the queue.
- [Qwen3-TTS mispronounces languages that it does not list] → Fallback to the macOS voice is on by default. The Settings shows the supported list.
- [audiotee exclusion does not work on some macOS version] → The mic gate still blocks the echo loop. The real test checks `/api/transcript` while TTS plays.
- [Echo into the mic after playback] → A release window of 0.8 s.
- [Memory: ASR (local) + TTS models together] → The TTS model loads only when used. The 0.6B 8-bit model is used.

## Migration Plan

New `tts_*` keys have defaults, so old `config.toml` files load. The default engine is `system`, so nothing downloads after an update. Rollback: revert the PR. The downloaded model stays in the HF cache, and Settings → Uninstall lists the command to remove it.

## Open Questions

None.

## Context

Greenfield macOS desktop app for real-time audio transcription and translation. The app targets Apple Silicon Macs (macOS 14.2+) running MLX-accelerated AI models locally. No existing codebase — this is the initial build.

Key constraints from exploration phase:
- System audio capture on macOS requires native binary (audiotee, Core Audio Taps API)
- mlx-qwen3-asr 1.7B provides streaming ASR with `feed_audio()` Session API (~3.4GB RAM)
- No diarization in v1 — mic = "You", speaker = "Others"
- User must install `uv` and `huggingface-cli` as prerequisites
- Electron process must own Python backend lifecycle

Reference implementations studied: Meetily (Tauri+Rust), meeting-companion (FastAPI+React), mlx-audio, mlx-qwen3-asr.

## Goals / Non-Goals

**Goals:**
- Capture microphone + system audio simultaneously on macOS
- Transcribe both streams in near real-time using a single on-device ASR model
- Auto-detect language per segment (English, Vietnamese, Cantonese, Chinese)
- Translate segments when language differs from user preference
- Simple, modern UI showing live transcript with source labels and translations
- Clean first-launch experience with prerequisite checking and model download

**Non-Goals:**
- Speaker diarization (deferred to v2)
- Windows/Linux support
- Offline LLM translation (requires external OpenAI-compatible API)
- Audio recording/playback/export
- Multi-user or cloud sync
- Mobile support

## Decisions

### 1. Python backend as headless sidecar (not embedded in Electron)

Python runs as a separate process spawned by Electron via `uv run`. Communication via localhost HTTP/WebSocket.

- **Why**: MLX and mlx-qwen3-asr are Python-native. No viable way to call MLX from Node.js. Process isolation means a crash in ASR doesn't kill the UI.
- **Rejected**: Embedding Python in Electron via node-addon — too fragile, version conflicts, debugging nightmare.
- **Rejected**: Rust sidecar with MLX C bindings — MLX's C API is incomplete, mlx-qwen3-asr is Python-only.

### 2. Single ASR Session processing both streams sequentially

One mlx-qwen3-asr Session instance. VAD filters both streams independently, then speech segments are queued and fed to the single Session one at a time, tagged with their source.

- **Why**: Qwen3-ASR 1.7B uses ~3.4GB RAM. Two instances would double that. The model processes faster than real-time (RTF 0.27x), so sequential processing of interleaved segments keeps up easily.
- **Rejected**: Two Session instances — excessive memory, unclear if MLX shares weights.
- **Rejected**: Mixing both streams into one audio signal — loses source attribution.

### 3. audiotee as pre-built bundled binary

The audiotee Swift CLI binary is pre-compiled and bundled in the Electron app's resources, then copied to `~/.just-transcribe/bin/` on first launch.

- **Why**: Avoids requiring Swift toolchain on user's machine. audiotee is ~2MB, no external dependencies. Core Audio Taps API (macOS 14.2+) is cleaner than ScreenCaptureKit.
- **Rejected**: Compiling at first launch — requires xcode-select, adds complexity and failure modes.
- **Rejected**: ScreenCaptureKit via pyobjc — broken on macOS 15 (delegate callback bug).
- **Rejected**: proc-tap — doesn't work in testing.

### 4. electron-vite with React + TypeScript for frontend

Modern Electron tooling with Vite for fast HMR, React for UI, TypeScript for type safety.

- **Why**: electron-vite is the most modern and lightweight Electron framework. Vite provides sub-second HMR. React has the largest ecosystem for UI components.
- **Rejected**: electron-forge — Webpack-based, slower dev experience.
- **Rejected**: Tauri — would need Rust for the backend, but ASR is Python-only.

### 5. `~/.just-transcribe/` as app directory

Dedicated dotfolder in user's home for Python source, venv, audiotee binary, config, and logs. Models stay in standard `~/.cache/huggingface/`.

- **Why**: Survives Electron app updates. Easy to debug (`cd ~/.just-transcribe && uv run ...`). Clean uninstall (`rm -rf ~/.just-transcribe`). Standard HF cache is shared with other ML tools.
- **Rejected**: Inside Electron's app bundle — macOS app translocation breaks paths, updates wipe venv.
- **Rejected**: `~/Library/Application Support/` — harder to access, less dev-friendly.

### 6. Random port with stdin EOF lifecycle

Electron picks a random free port, passes it as `--port` arg to Python. Python detects parent death via stdin EOF (Electron pipes stdin).

- **Why**: Random port avoids conflicts. stdin EOF is the most reliable cross-platform parent death detection — no polling, no PID checks.
- **Rejected**: Fixed port — conflicts with other services.
- **Rejected**: PID polling — racy, platform-specific.

### 8. Translation as a core comprehension feature, not secondary

Translation is visually prominent in the UI — displayed inline alongside original text, not tucked below in muted style. The primary use case is understanding a Cantonese/Vietnamese discussion as it happens.

- **Why**: Deep interview revealed translation is a core comprehension tool, not a "nice to have". The user needs to follow foreign-language discussions in real-time.
- **Latency budget**: 3-5 seconds from speech to translated text is acceptable (confirmed via contrarian challenge). Transcription appears first (0.5-2s), translation follows asynchronously.
- **UI implication**: Dashboard layout with transcript as main area + sidebar for controls. Each segment shows original text with translation prominently displayed (not dimmed or secondary).

### 7. Silero VAD instead of Sortformer for voice activity detection

Use Silero VAD (lightweight, ~2MB) for speech/silence detection. Sortformer reserved for future diarization work.

- **Why**: VAD only needs to detect speech vs silence. Silero is proven (used by Meetily and meeting-companion), tiny, and fast. Sortformer is overkill for just VAD — it's a diarization model.
- **Rejected**: Sortformer for VAD — 300MB+ model for a binary classification task.

## Risks / Trade-offs

- **[macOS 14.2+ requirement]** Core Audio Taps API limits compatibility. → Acceptable: Apple Silicon Macs overwhelmingly run macOS 14+.
- **[Prerequisite burden]** User must install `uv` and `huggingface-cli` manually. → Mitigate with clear README and first-launch checks with actionable error messages.
- **[Model download size]** ~3.4GB for Qwen3-ASR on first launch. → Show progress in UI, downloads are resumable via huggingface-hub.
- **[Sequential ASR bottleneck]** If both speakers talk simultaneously for extended periods, transcription queue could build up. → RTF is 0.27x so queue drains 3.7x faster than real-time. Only an issue in rare edge cases.
- **[No diarization]** Multiple remote speakers all labeled "Others". → Acceptable for v1. Most use cases are 1-on-1 calls. Clear upgrade path to Sortformer in v2.
- **[Translation latency]** LLM API adds 0.5-2s per segment. → Show transcription immediately (0.5-2s), overlay translation asynchronously (3-5s total from speech). Confirmed acceptable via deep interview.
- **[audiotee maintenance]** Using a forked/fixed version of audiotee. → Binary is small and stable. Pin to known-good build.

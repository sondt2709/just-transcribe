## Why

There is no lightweight, privacy-first macOS app that captures both microphone and system audio simultaneously, transcribes in near real-time using on-device AI (Apple Silicon MLX), auto-detects languages (English, Vietnamese, Cantonese, Chinese), and translates on the fly. Existing tools are either cloud-dependent, lack system audio capture, or require heavy IDE toolchains. Building this now leverages mature MLX ports of Qwen3-ASR 1.7B and the audiotee Swift CLI for system audio capture.

**Primary use cases** (from deep interview):
1. **Live meeting/call transcription** — user is in a Zoom/Meet/Teams call and needs real-time captions + translation of what everyone says, especially when the other side discusses in a different language (e.g., Cantonese)
2. **In-person meeting notes** — multiple people in a room, running transcript with auto language detection

**Key quality priorities**: Transcription accuracy > speed (0.5-2s latency expected). Translation is a core comprehension tool (3-5s delay acceptable), not a secondary feature.

**Acceptance test**: 10-minute bilingual Zoom call with Cantonese/Vietnamese speaker — user can follow the conversation via transcript + translation.

## What Changes

- New Electron + Python desktop app for macOS (Apple Silicon)
- Python backend captures microphone (sounddevice) and system audio (audiotee subprocess) at 16kHz mono
- Single mlx-qwen3-asr 1.7B Session processes both audio streams with automatic language detection
- VAD filters silence before ASR inference
- OpenAI-compatible LLM API translates segments when detected language differs from user's preferred language
- Electron frontend (electron-vite + React + TypeScript) displays live transcript with speaker source labels ("You" vs "Others") and inline translations
- FastAPI + WebSocket server bridges Python backend to Electron UI
- App directory at `~/.just-transcribe/` for binaries, config, and logs; models in standard `~/.cache/huggingface/`
- Prerequisites: user installs `uv`, `huggingface-cli`; audiotee binary bundled with Electron app
- Python backend lifecycle tied to Electron process (SIGTERM on quit, stdin EOF detection)
- No speaker diarization in v1 — mic stream labeled "You", speaker stream labeled "Others"

## Capabilities

### New Capabilities
- `audio-capture`: Dual-stream audio capture — microphone via sounddevice, system audio via audiotee subprocess, both at 16kHz mono PCM
- `transcription-pipeline`: VAD-filtered ASR using single mlx-qwen3-asr 1.7B Session with streaming `feed_audio()`, auto language detection, source tagging
- `translation`: Async per-segment translation via OpenAI-compatible LLM API, triggered when detected language != preferred language
- `backend-server`: FastAPI server with HTTP REST control API and WebSocket streaming for transcript events, random port allocation
- `electron-shell`: Electron app (electron-vite + React) managing Python sidecar lifecycle, first-launch setup, permission handling, and modern transcript UI
- `app-config`: App directory structure (`~/.just-transcribe/`), configuration, model management via huggingface-cli, prerequisites checking

### Modified Capabilities

(none — greenfield project)

## Impact

- **New code**: Python package (`just_transcribe`) + Electron app (`electron/`)
- **System dependencies**: uv, huggingface-cli, bundled audiotee binary
- **AI models**: Qwen3-ASR 1.7B (~3.4GB), Silero VAD (~30MB) — downloaded via huggingface-cli
- **macOS permissions**: NSMicrophoneUsageDescription, NSAudioCaptureUsageDescription (Core Audio Taps, macOS 14.2+)
- **APIs**: OpenAI-compatible LLM endpoint (user-configured)
- **RAM**: ~4-5GB during operation (ASR model + Python + Electron)

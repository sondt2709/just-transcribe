# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Just Transcribe — real-time audio transcription/translation for macOS. Electron (React + TypeScript + Tailwind) desktop app that spawns a local Python backend (FastAPI + WebSocket) which runs Qwen3-ASR locally via mlx-audio. Audio captured by a custom `audiotee` binary (mic + system audio). macOS arm64 only.

## Releases & PR rules (IMPORTANT)

Releases are fully automated via semantic-release on every merge to `main` (`.github/workflows/release.yml`):

- **PR titles MUST follow Conventional Commits** — enforced by CI (`pr-title-check.yml`). Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Merges are **squash-only**; the PR title becomes the commit message and drives the version bump:
  - `fix:` → patch, `feat:` → minor, `feat!:` or `BREAKING CHANGE:` footer → major
  - `chore:`/`docs:`/`refactor:`/`test:` → no release
- Pick the type deliberately: a `feat:`/`fix:` PR ships a public release (DMG build + tag + GitHub release + Homebrew cask update) immediately on merge.
- **Never edit these by hand** (CI owns them):
  - `Casks/just-transcribe.rb` version/sha256 (updated by CI post-release)
  - `electron/package.json` `version` field (patched at build time; git tags are the source of truth)
  - Never push tags manually
- semantic-release config: `.releaserc.json`.

## Commands

```sh
# Electron app (primary)
cd electron
npm install
npm run dev            # dev mode
npm run build          # production build
npx electron-builder --mac   # package DMG → electron/dist/

# Python backend (standalone)
cd python
uv sync
uv run python -m just_transcribe   # run server directly
```

No test suite or linter is configured yet in either subproject.

## Architecture

Two processes, one repo:

- `electron/src/main/` — Electron main process. `python.ts` spawns/manages the Python backend as a child process; `setup.ts` handles first-run setup (creates the uv Python env in `~/.just-transcribe`); `tray.ts` menu bar; overlay window with click-through toggle.
- `electron/src/renderer/` — React UI. `hooks/useBackend.ts` + `useTranscript.ts` talk to the backend over WebSocket. Key views: `Transcript`, `OverlayView`, `Settings`, `Setup`.
- `electron/src/preload/` — IPC bridge.
- `python/src/just_transcribe/` — FastAPI + WebSocket server (`server.py`), audio capture (`audio/`, wraps `audiotee`), ASR/translation pipeline (`pipeline/`), TOML config (`config.py`, stored at `~/.just-transcribe/config.toml`).

The installed app does NOT bundle Python — end users run a setup flow that creates the env with uv and downloads the model via huggingface-cli.

`flutter/`, `kmp/`, `docs/refs/` are mobile-app experiments (see `openspec/changes/`), not part of the released macOS app.

## OpenSpec

Repo uses OpenSpec for change management (`openspec/`). Significant features go through a change proposal (`/opsx:new` or `/opsx:propose`) before implementation; specs live in `openspec/specs/` after archiving.

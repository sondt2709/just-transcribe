## Context

Just Transcribe is an Electron + Python sidecar app for macOS. Currently it runs in dev mode only. The DMG build is broken because:
1. Python source is not included in `extraResources` — prod setup fails immediately
2. No app icon — uses default Electron icon
3. Setup screen doesn't guide model download clearly
4. No uninstall guidance exists

The app depends on external tools (`uv`, `hf`) that users must install themselves. The ASR model (~3.5GB) is cached in `~/.cache/huggingface/`.

## Goals / Non-Goals

**Goals:**
- DMG installs and runs correctly on a Mac with `uv` and `hf` pre-installed
- Setup screen clearly guides users through all prerequisites including model download
- App has a proper icon and branding
- Users can cleanly uninstall all components

**Non-Goals:**
- Code signing / notarization (requires Apple Developer account — future work)
- Bundling `uv` or `hf` into the DMG (users install these themselves)
- Auto-updating mechanism
- Windows/Linux support

## Decisions

### 1. Bundle python source via extraResources

Add `../python/src` and `../python/pyproject.toml` to `build.mac.extraResources` in `package.json`. Exclude `.venv`, `uv.lock`, `__pycache__`, `.omc` — these are recreated by `uv sync` on first launch.

**Alternative considered:** Bundle entire python dir including `uv.lock` → Rejected because `uv.lock` may contain platform-specific paths and `uv sync` regenerates it anyway.

### 2. App icon from SVG

Convert `.tmp/icon.svg` → `.icns` using macOS `iconutil` (SVG → PNG at multiple sizes → iconset → icns). Place at `electron/build/icon.icns`. electron-builder auto-detects this path.

**Alternative considered:** Use a PNG directly → Rejected because macOS requires `.icns` for proper Dock/Finder rendering at all sizes.

### 3. Setup screen enhancement

Restructure setup flow into clear steps:

```
Step 1: Prerequisites (user action)
  ├── Install uv:  curl -LsSf https://astral.sh/uv/install.sh | sh
  ├── Install hf:  brew install huggingface-cli  OR  uv tool install huggingface-cli
  └── [Refresh] to re-check

Step 2: Download model (user action)
  └── hf download Qwen/Qwen3-ASR-1.7B
  └── [Refresh] to re-check

Step 3: Run Setup (app action)
  ├── Creates ~/.just-transcribe/
  ├── Copies python source + audiotee
  ├── Runs uv sync (installs Python deps)
  └── Starts backend
```

Each step only shows when the previous is complete. This prevents users from hitting "Run Setup" before prerequisites are ready.

### 4. Uninstall as in-app menu + setup screen info

Add an "About" or help section with uninstall instructions. Three levels:

```
Level 1 — Remove app only:
  rm -rf /Applications/Just\ Transcribe.app

Level 2 — Remove app + data:
  rm -rf /Applications/Just\ Transcribe.app
  rm -rf ~/.just-transcribe
  rm -rf ~/Library/Application\ Support/just-transcribe

Level 3 — Remove everything including model:
  (Level 2 commands plus)
  rm -rf ~/.cache/huggingface/hub/models--Qwen--Qwen3-ASR-1.7B
```

Show this in the Settings panel under an "Uninstall" section.

### 5. App identity

- **Name:** "Just Transcribe" (keep current — clear, descriptive, unique enough)
- **Bundle ID:** `com.just-transcribe.app` (already set)
- **Data dir:** `~/.just-transcribe` (already set)

## Risks / Trade-offs

- **[No code signing]** → macOS Gatekeeper will warn "unidentified developer". Users must right-click → Open on first launch. Documented in README. Mitigation: future Apple Developer enrollment.
- **[Large first-run download]** → `uv sync` downloads Python + deps, model is ~3.5GB. Mitigation: clear progress indication in setup UI; model download is a separate explicit step.
- **[uv/hf version drift]** → Users may have old versions of uv or hf. Mitigation: check minimum version if issues arise; for now trust latest.
- **[config.toml lost on uninstall]** → Level 2+ uninstall deletes user config. Acceptable — user chose full removal.

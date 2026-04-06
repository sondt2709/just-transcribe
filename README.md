# Just Transcribe

Real-time audio transcription and translation for macOS. Captures your microphone and system audio, transcribes speech locally using AI, and optionally translates to your preferred language.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop app | Electron + React + TypeScript + Tailwind CSS |
| Backend | Python + FastAPI + WebSocket |
| Speech-to-text | [Qwen3-ASR 1.7B 8-bit](https://huggingface.co/mlx-community/Qwen3-ASR-1.7B-8bit) (runs locally via [mlx-audio](https://github.com/Blaizzy/mlx-audio)) |
| Translation | Any OpenAI-compatible LLM API |
| Audio capture | Custom `audiotee` binary (mic + system audio) |
| Package manager | [uv](https://docs.astral.sh/uv/) (Python) |

## Install

### Step 1: Download the app

Go to [Releases](https://github.com/sondt2709/just-transcribe/releases) and download the latest `.dmg` file. Open it and drag **Just Transcribe** to your Applications folder.

> **Note:** The app is not signed with an Apple certificate. On first launch, right-click the app and choose **Open**, then click **Open** again in the dialog.

### Step 2: Install required tools

Open **Terminal** (search "Terminal" in Spotlight) and run these commands one at a time:

```sh
# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install huggingface-cli (model downloader)
brew install huggingface-cli
```

> Don't have Homebrew? Install it first: https://brew.sh
>
> Alternative (if you prefer not to use Homebrew):
> ```sh
> uv tool install huggingface-cli
> ```

### Step 3: Download the AI model

Still in Terminal, run:

```sh
hf download mlx-community/Qwen3-ASR-1.7B-8bit
```

This downloads ~1.8 GB. It only needs to happen once.

### Step 4: Launch and set up

Open **Just Transcribe** from Applications. The app will check that everything is installed, then click **Run Setup** to finish. This creates a Python environment and takes a minute or two.

That's it — you're ready to transcribe!

## Features

- **Real-time transcription** — speech to text as you speak
- **Dual audio capture** — microphone + system audio (hear what others say in calls)
- **Local AI** — runs Qwen3-ASR (8-bit quantized) on your Mac via mlx-audio, no cloud needed
- **Translation** — optionally translate to your preferred language via LLM API
- **Multi-language** — supports English, Vietnamese, Chinese, Japanese, Korean, and more

## Configuration

Click the gear icon in the app to configure:

- **Preferred language** — target language for translations
- **Audio sources** — enable/disable microphone and system audio
- **LLM API** — set up an OpenAI-compatible API for translation (base URL, model, API key)

Settings are stored in `~/.just-transcribe/config.toml`.

## Uninstall

Remove any or all components independently. Open Terminal and run whichever you need:

```sh
# Remove the app
rm -rf /Applications/Just\ Transcribe.app

# Remove app data (config, Python environment, logs)
rm -rf ~/.just-transcribe
rm -rf ~/Library/Application\ Support/just-transcribe

# Remove the AI model (~1.8 GB)
rm -rf ~/.cache/huggingface/hub/models--mlx-community--Qwen3-ASR-1.7B-8bit
```

## Development

### Prerequisites

- Node.js 24+ (LTS)
- [uv](https://docs.astral.sh/uv/)

### Run in dev mode

```sh
cd electron
npm install
npm run dev
```

### Build DMG

```sh
cd electron
npm run build
npx electron-builder --mac
```

The DMG is output to `electron/dist/`.

## License

[MIT](LICENSE)

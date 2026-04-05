"""Application configuration and directory management."""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# App directory structure
APP_DIR = Path.home() / ".just-transcribe"
BIN_DIR = APP_DIR / "bin"
LOG_DIR = APP_DIR / "logs"
CONFIG_FILE = APP_DIR / "config.toml"
AUDIOTEE_BIN = BIN_DIR / "audiotee"

# Model defaults
DEFAULT_ASR_MODEL = "Qwen/Qwen3-ASR-1.7B"
DEFAULT_SAMPLE_RATE = 16000

# VAD defaults
VAD_THRESHOLD = 0.5
VAD_NEG_THRESHOLD = 0.15
VAD_MIN_SPEECH_S = 0.25
VAD_MIN_SILENCE_S = 1.0
VAD_CHUNK_SAMPLES = 512  # Silero VAD requires exactly 512 samples at 16kHz
VAD_MAX_SPEECH_S = 15.0  # Force-emit segment after this duration (prevents infinite accumulation)


@dataclass
class AppConfig:
    preferred_language: str = "en"
    mic_enabled: bool = True
    speaker_enabled: bool = True
    llm_api_base: str = ""
    llm_model: str = ""
    llm_api_key: str = ""
    asr_provider: str = "local"  # "local" or "remote"
    asr_model: str = DEFAULT_ASR_MODEL
    asr_language: str = ""  # empty = auto-detect, or ISO code like "vi", "en", "zh"
    asr_base_url: str = ""  # remote ASR server URL
    asr_api_key: str = ""  # remote ASR API key

    def to_dict(self) -> dict:
        return {
            "preferred_language": self.preferred_language,
            "mic_enabled": self.mic_enabled,
            "speaker_enabled": self.speaker_enabled,
            "llm_api_base": self.llm_api_base,
            "llm_model": self.llm_model,
            "llm_api_key": self.llm_api_key,
            "asr_provider": self.asr_provider,
            "asr_model": self.asr_model,
            "asr_language": self.asr_language,
            "asr_base_url": self.asr_base_url,
            "asr_api_key": self.asr_api_key,
        }

    @classmethod
    def from_dict(cls, data: dict) -> AppConfig:
        return cls(
            preferred_language=data.get("preferred_language", "en"),
            mic_enabled=data.get("mic_enabled", True),
            speaker_enabled=data.get("speaker_enabled", True),
            llm_api_base=data.get("llm_api_base", ""),
            llm_model=data.get("llm_model", ""),
            llm_api_key=data.get("llm_api_key", ""),
            asr_provider=data.get("asr_provider", "local"),
            asr_model=data.get("asr_model", DEFAULT_ASR_MODEL),
            asr_language=data.get("asr_language", ""),
            asr_base_url=data.get("asr_base_url", ""),
            asr_api_key=data.get("asr_api_key", ""),
        )


def ensure_directories() -> None:
    """Create app directory structure if it doesn't exist."""
    for d in [APP_DIR, BIN_DIR, LOG_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def load_config() -> AppConfig:
    """Load config from TOML file, or return defaults."""
    if not CONFIG_FILE.exists():
        return AppConfig()
    try:
        import tomli

        with open(CONFIG_FILE, "rb") as f:
            data = tomli.load(f)
        return AppConfig.from_dict(data)
    except Exception as e:
        logger.warning("Failed to load config, using defaults: %s", e)
        return AppConfig()


def save_config(config: AppConfig) -> None:
    """Save config to TOML file."""
    ensure_directories()
    try:
        import tomli_w

        with open(CONFIG_FILE, "wb") as f:
            tomli_w.dump(config.to_dict(), f)
    except Exception as e:
        logger.error("Failed to save config: %s", e)

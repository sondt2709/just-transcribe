"""Application configuration and directory management."""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# App directory structure
APP_DIR = Path.home() / ".just-transcribe"
BIN_DIR = APP_DIR / "bin"
LOG_DIR = APP_DIR / "logs"
SESSIONS_DIR = APP_DIR / "sessions"
CONFIG_FILE = APP_DIR / "config.toml"
AUDIOTEE_BIN = BIN_DIR / "audiotee"

# Model defaults
DEFAULT_ASR_MODEL = "mlx-community/Qwen3-ASR-1.7B-8bit"
DEFAULT_SAMPLE_RATE = 16000

# TTS defaults
DEFAULT_TTS_QWEN_MODEL = "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"
TTS_ENGINES = ("system", "qwen_local", "qwen_remote")

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
    preferred_language_2: str = ""  # optional second translation target (empty = disabled)
    asr_language: str = ""  # empty = auto-detect, or ISO code like "vi", "en", "zh"
    asr_base_url: str = ""  # remote ASR server URL
    asr_api_key: str = ""  # remote ASR API key
    asr_timeout_s: float = 10.0  # per-request timeout for remote ASR
    debug_audio: bool = False  # save ASR input WAVs + stall ring dumps
    summary_mode: str = "auto"  # "auto" (debounced on final segments) or "manual"
    summary_debounce_s: float = 10.0  # silence after the last final segment before an auto run
    summary_max_wait_s: float = 60.0  # auto run at the latest this long after new speech starts; 0 = off
    summary_min_segments: int = 2  # new final segments needed for an auto run
    summary_window_s: float = 600.0  # max span of new transcript per LLM call
    summary_overlap_s: float = 60.0  # already-summarized transcript repeated for context
    summary_prompt: str = ""  # user template; empty = built-in default
    tts_engine: str = "system"  # "system" (macOS say), "qwen_local", "qwen_remote"
    tts_target_lang: str = "en"  # language spoken to the other party
    tts_system_voice: str = ""  # macOS voice name; empty = first voice for the language
    tts_qwen_model: str = DEFAULT_TTS_QWEN_MODEL
    tts_qwen_voice: str = "ryan"
    tts_remote_url: str = ""  # OpenAI-compatible /v1/audio/speech server
    tts_remote_api_key: str = ""
    tts_remote_model: str = ""
    tts_output_device: str = ""  # output device name; empty = system default
    tts_fallback_system: bool = True  # macOS voice for languages Qwen3-TTS does not list
    tts_speak_mic: bool = False  # translate + speak each final "You" segment

    def to_dict(self) -> dict:
        return {
            "preferred_language": self.preferred_language,
            "preferred_language_2": self.preferred_language_2,
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
            "asr_timeout_s": self.asr_timeout_s,
            "debug_audio": self.debug_audio,
            "summary_mode": self.summary_mode,
            "summary_debounce_s": self.summary_debounce_s,
            "summary_max_wait_s": self.summary_max_wait_s,
            "summary_min_segments": self.summary_min_segments,
            "summary_window_s": self.summary_window_s,
            "summary_overlap_s": self.summary_overlap_s,
            "summary_prompt": self.summary_prompt,
            "tts_engine": self.tts_engine,
            "tts_target_lang": self.tts_target_lang,
            "tts_system_voice": self.tts_system_voice,
            "tts_qwen_model": self.tts_qwen_model,
            "tts_qwen_voice": self.tts_qwen_voice,
            "tts_remote_url": self.tts_remote_url,
            "tts_remote_api_key": self.tts_remote_api_key,
            "tts_remote_model": self.tts_remote_model,
            "tts_output_device": self.tts_output_device,
            "tts_fallback_system": self.tts_fallback_system,
            "tts_speak_mic": self.tts_speak_mic,
        }

    @classmethod
    def from_dict(cls, data: dict) -> AppConfig:
        return cls(
            preferred_language=data.get("preferred_language", "en"),
            preferred_language_2=data.get("preferred_language_2", ""),
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
            asr_timeout_s=float(data.get("asr_timeout_s", 10.0)),
            debug_audio=bool(data.get("debug_audio", False)),
            summary_mode=data.get("summary_mode", "auto") if data.get("summary_mode") in ("auto", "manual") else "auto",
            summary_debounce_s=float(data.get("summary_debounce_s", 10.0)),
            summary_max_wait_s=float(data.get("summary_max_wait_s", 60.0)),
            summary_min_segments=int(data.get("summary_min_segments", 2)),
            summary_window_s=float(data.get("summary_window_s", 600.0)),
            summary_overlap_s=float(data.get("summary_overlap_s", 60.0)),
            summary_prompt=str(data.get("summary_prompt", "")),
            tts_engine=data.get("tts_engine") if data.get("tts_engine") in TTS_ENGINES else "system",
            tts_target_lang=str(data.get("tts_target_lang") or "en"),
            tts_system_voice=str(data.get("tts_system_voice", "")),
            tts_qwen_model=str(data.get("tts_qwen_model") or DEFAULT_TTS_QWEN_MODEL),
            tts_qwen_voice=str(data.get("tts_qwen_voice") or "ryan"),
            tts_remote_url=str(data.get("tts_remote_url", "")),
            tts_remote_api_key=str(data.get("tts_remote_api_key", "")),
            tts_remote_model=str(data.get("tts_remote_model", "")),
            tts_output_device=str(data.get("tts_output_device", "")),
            tts_fallback_system=bool(data.get("tts_fallback_system", True)),
            tts_speak_mic=bool(data.get("tts_speak_mic", False)),
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


def save_config(config: AppConfig, path: Optional[Path] = None) -> None:
    """Save config to TOML file.

    Keys this backend does not own (the Electron main process writes overlay_*
    and launch_at_login to the same file) are kept: the file is read, the
    backend keys are updated, and the merged result is written back.
    """
    path = path or CONFIG_FILE
    ensure_directories()
    try:
        import tomli
        import tomli_w

        existing: dict = {}
        if path.exists():
            try:
                with open(path, "rb") as f:
                    existing = tomli.load(f)
            except Exception as e:
                logger.warning("Config file unreadable, rewriting it: %s", e)
        with open(path, "wb") as f:
            tomli_w.dump({**existing, **config.to_dict()}, f)
    except Exception as e:
        logger.error("Failed to save config: %s", e)

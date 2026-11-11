"""Translate-and-speak: TTS engines (macOS voice, Qwen3-TTS local/remote), a playback
queue, and the Qwen3-TTS model download.

Playback runs in this (backend) process so audiotee can exclude our PID from the
system-audio capture, and the orchestrator can gate the mic while we speak.
"""

from __future__ import annotations

import asyncio
import io
import itertools
import logging
import re
import subprocess
import tempfile
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional, Protocol

import numpy as np

from just_transcribe.config import DEFAULT_TTS_QWEN_MODEL, AppConfig

logger = logging.getLogger(__name__)

# Languages listed in Qwen3-TTS codec_language_id (all mlx variants)
QWEN_LANGS = {
    "en": "english", "zh": "chinese", "ja": "japanese", "ko": "korean", "de": "german",
    "fr": "french", "ru": "russian", "pt": "portuguese", "es": "spanish", "it": "italian",
}
QWEN_VOICES = ["ryan", "aiden", "serena", "vivian", "ono_anna", "sohee", "dylan", "eric", "uncle_fu"]
EXPECTED_MODEL_BYTES = {DEFAULT_TTS_QWEN_MODEL: 1_970_000_000}
PLAYBACK_RELEASE_S = 0.8
REPLAY_CACHE_SIZE = 20

# macOS novelty voices that should never be picked automatically
_NOVELTY_VOICES = {
    "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester",
    "Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Junior", "Ralph", "Fred", "Kathy",
}
_PREFERRED_VOICES = {"en": ["Samantha", "Alex", "Daniel"], "vi": ["Linh"]}
_LOCALE_ALIASES = {"yue": "zh_HK", "zh": "zh_CN"}


def base_lang(code: str) -> str:
    return (code or "").lower().split("-")[0].split("_")[0]


class Engine(Protocol):
    name: str

    def synthesize(self, text: str, lang: str) -> tuple[np.ndarray, int]: ...


# --- macOS system voices -----------------------------------------------------

_VOICE_LINE = re.compile(r"^(?P<name>.+?)\s+(?P<locale>[a-z]{2,3}_[A-Z0-9]{2,3})\s+#")


def parse_say_voices(output: str) -> list[dict]:
    voices = []
    for line in output.splitlines():
        m = _VOICE_LINE.match(line)
        if m:
            voices.append({"name": m["name"].strip(), "locale": m["locale"]})
    return voices


def pick_voice(voices: list[dict], lang: str) -> Optional[str]:
    """Best installed voice for a language code (e.g. 'vi' -> 'Linh')."""
    lang = base_lang(lang)
    alias = _LOCALE_ALIASES.get(lang)
    matches = [
        v["name"] for v in voices
        if (alias and v["locale"] == alias) or (not alias and v["locale"].split("_")[0] == lang)
    ]
    for preferred in _PREFERRED_VOICES.get(lang, []):
        if preferred in matches:
            return preferred
    for name in matches:
        if name.split(" (")[0] not in _NOVELTY_VOICES:
            return name
    return None


class SystemEngine:
    name = "system"

    def __init__(self, voice: str = "", runner: Callable[..., subprocess.CompletedProcess] = subprocess.run):
        self.voice = voice
        self._run = runner
        self._voices: Optional[list[dict]] = None

    def voices(self) -> list[dict]:
        if self._voices is None:
            try:
                out = self._run(["say", "-v", "?"], capture_output=True, text=True, timeout=10).stdout
                self._voices = parse_say_voices(out)
            except Exception as e:  # pragma: no cover - only without `say`
                logger.warning("Cannot list macOS voices: %s", e)
                self._voices = []
        return self._voices

    def voice_for(self, lang: str) -> Optional[str]:
        return self.voice or pick_voice(self.voices(), lang)

    def synthesize(self, text: str, lang: str) -> tuple[np.ndarray, int]:
        import soundfile as sf

        voice = self.voice_for(lang)
        if not voice:
            raise RuntimeError(f"No macOS voice installed for '{lang}'")
        with tempfile.TemporaryDirectory() as d:
            txt, wav = Path(d) / "in.txt", Path(d) / "out.wav"
            txt.write_text(text, encoding="utf-8")  # -f avoids text being read as options
            self._run(
                ["say", "-v", voice, "-f", str(txt), "-o", str(wav),
                 "--file-format=WAVE", "--data-format=LEI16@22050"],
                check=True, capture_output=True, timeout=120,
            )
            audio, sr = sf.read(str(wav), dtype="float32")
        return audio, sr


# --- Qwen3-TTS ---------------------------------------------------------------


def hf_model_dir(model_id: str) -> Path:
    from huggingface_hub.constants import HF_HUB_CACHE

    return Path(HF_HUB_CACHE) / f"models--{model_id.replace('/', '--')}"


def model_downloaded(model_id: str) -> bool:
    snaps = hf_model_dir(model_id) / "snapshots"
    return snaps.is_dir() and any(snaps.glob("*/model*.safetensors"))


def model_cache_bytes(model_id: str) -> int:
    blobs = hf_model_dir(model_id) / "blobs"
    if not blobs.is_dir():
        return 0
    return sum(f.stat().st_size for f in blobs.iterdir() if f.is_file())


class QwenLocalEngine:
    name = "qwen_local"

    def __init__(self, model_id: str, voice: str, loader: Optional[Callable[[str], object]] = None):
        self.model_id = model_id
        self.voice = voice
        self._loader = loader
        self._model = None
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            if self._loader is None and not model_downloaded(self.model_id):
                raise RuntimeError("Qwen3-TTS model not downloaded")
            loader = self._loader
            if loader is None:
                from mlx_audio.tts.utils import load_model as loader
            t0 = time.monotonic()
            self._model = loader(self.model_id)
            logger.info("Qwen3-TTS loaded in %.1fs: %s", time.monotonic() - t0, self.model_id)

    def synthesize(self, text: str, lang: str) -> tuple[np.ndarray, int]:
        self.load()
        with self._lock:
            chunks = [
                np.asarray(r.audio, dtype=np.float32)
                for r in self._model.generate(text, voice=self.voice, lang_code=QWEN_LANGS.get(base_lang(lang), "auto"))
            ]
        if not chunks:
            raise RuntimeError("Qwen3-TTS returned no audio")
        return np.concatenate(chunks), int(self._model.sample_rate)


class QwenRemoteEngine:
    name = "qwen_remote"

    def __init__(self, url: str, model: str, voice: str, api_key: str = "", transport=None):
        self.url = url.rstrip("/")
        self.model = model
        self.voice = voice
        self.api_key = api_key
        self._transport = transport

    def synthesize(self, text: str, lang: str) -> tuple[np.ndarray, int]:
        import httpx
        import soundfile as sf

        if not self.url:
            raise RuntimeError("Remote TTS URL not configured")
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        with httpx.Client(timeout=120.0, transport=self._transport) as client:
            resp = client.post(
                f"{self.url}/v1/audio/speech",
                headers=headers,
                json={
                    "model": self.model,
                    "input": text,
                    "voice": self.voice,
                    "lang_code": QWEN_LANGS.get(base_lang(lang), "auto"),
                    "response_format": "wav",
                },
            )
            resp.raise_for_status()
        audio, sr = sf.read(io.BytesIO(resp.content), dtype="float32")
        return audio, sr


# --- playback ----------------------------------------------------------------


class SoundDevicePlayer:
    """Blocking playback on a named output device; stoppable from another thread.

    `can_reload()` says whether PortAudio may be reloaded (no mic stream is open:
    Pa_Terminate closes every open stream).
    """

    def __init__(self, can_reload: Callable[[], bool] = lambda: True):
        self.can_reload = can_reload

    def play(self, audio: np.ndarray, sr: int, device_name: str, stop: threading.Event) -> None:
        import sounddevice as sd

        try:
            self._play(sd, audio, sr, device_name, stop)
        except sd.PortAudioError as e:
            # Same failure as the mic fix (#9): PortAudio keeps the device list from
            # its initialization; after a device change, opening a stream fails.
            if not self.can_reload():
                raise RuntimeError(
                    f"{e}. The audio devices changed: stop and start recording, then try again."
                ) from e
            logger.warning("Output stream failed (%s); reloading PortAudio and retrying", e)
            sd._terminate()
            sd._initialize()
            self._play(sd, audio, sr, device_name, stop)

    @staticmethod
    def _play(sd, audio: np.ndarray, sr: int, device_name: str, stop: threading.Event) -> None:
        device = resolve_output_device(device_name, sd.query_devices())
        channels = 1
        try:
            info = sd.query_devices(device, "output") if device is not None else sd.query_devices(kind="output")
            channels = min(2, int(info["max_output_channels"])) or 1
        except Exception:
            pass
        data = audio if audio.ndim == 2 else audio.reshape(-1, 1)
        if channels == 2 and data.shape[1] == 1:
            data = np.repeat(data, 2, axis=1)
        pos = 0
        done = threading.Event()

        def callback(outdata, frames, _time, _status):
            nonlocal pos
            chunk = data[pos : pos + frames]
            outdata[: len(chunk)] = chunk
            outdata[len(chunk) :] = 0
            pos += frames
            if pos >= len(data) or stop.is_set():
                raise sd.CallbackStop

        with sd.OutputStream(
            samplerate=sr, channels=data.shape[1], dtype="float32", device=device,
            callback=callback, finished_callback=done.set,
        ):
            while not done.wait(0.05):
                if stop.is_set():
                    break


def resolve_output_device(name: str, devices) -> Optional[int]:
    if not name:
        return None
    for i, d in enumerate(devices):
        if d["name"] == name and d["max_output_channels"] > 0:
            return i
    logger.warning("Output device '%s' not found; using the system default", name)
    return None


def output_device_names(devices) -> list[str]:
    return [d["name"] for d in devices if d["max_output_channels"] > 0]


# --- service -----------------------------------------------------------------

_ids = itertools.count(1)


@dataclass
class Utterance:
    id: int
    original: str
    text: str = ""
    lang: str = ""
    source_lang: str = ""
    translate: bool = True
    engine: str = ""
    status: str = "queued"
    error: str = ""
    audio: Optional[np.ndarray] = field(default=None, repr=False)
    sample_rate: int = 0

    def event(self) -> dict:
        return {
            "type": "speak", "id": self.id, "status": self.status, "original": self.original,
            "text": self.text, "lang": self.lang, "engine": self.engine, "error": self.error,
        }


class SpeechService:
    def __init__(
        self,
        config: AppConfig,
        translator=None,
        on_event: Optional[Callable[[dict], None]] = None,
        player=None,
        engine_factory: Optional[Callable[[str, AppConfig], Engine]] = None,
        downloader: Optional[Callable[[str], object]] = None,
    ):
        self._translator = translator
        self._on_event = on_event
        self._player = player or SoundDevicePlayer()
        self._engine_factory = engine_factory or self._default_engine
        self._downloader = downloader
        self._engines: dict[str, Engine] = {}
        self._queue: asyncio.Queue[Utterance] | None = None
        self._worker: Optional[asyncio.Task] = None
        self._stop = threading.Event()
        self._cache: OrderedDict[int, Utterance] = OrderedDict()
        self._playing = False
        self._played_until = 0.0
        self.current: Optional[Utterance] = None
        self.downloading = False
        self.download_error = ""
        self.cfg = config

    # --- config / engines ---

    def configure(self, cfg: AppConfig) -> None:
        old = self.cfg
        self.cfg = cfg
        keys = ("tts_system_voice", "tts_qwen_model", "tts_qwen_voice", "tts_remote_url", "tts_remote_api_key", "tts_remote_model")
        if any(getattr(old, k) != getattr(cfg, k) for k in keys):
            # keep a loaded Qwen model when only its voice changed
            qwen = self._engines.get("qwen_local")
            self._engines = {}
            if isinstance(qwen, QwenLocalEngine) and qwen.model_id == cfg.tts_qwen_model:
                qwen.voice = cfg.tts_qwen_voice
                self._engines["qwen_local"] = qwen

    @staticmethod
    def _default_engine(name: str, cfg: AppConfig) -> Engine:
        if name == "qwen_local":
            return QwenLocalEngine(cfg.tts_qwen_model, cfg.tts_qwen_voice)
        if name == "qwen_remote":
            return QwenRemoteEngine(cfg.tts_remote_url, cfg.tts_remote_model, cfg.tts_qwen_voice, cfg.tts_remote_api_key)
        return SystemEngine(cfg.tts_system_voice)

    def engine(self, name: str) -> Engine:
        if name not in self._engines:
            self._engines[name] = self._engine_factory(name, self.cfg)
        return self._engines[name]

    def engine_for(self, lang: str) -> str:
        name = self.cfg.tts_engine
        if name != "system" and self.cfg.tts_fallback_system and base_lang(lang) not in QWEN_LANGS:
            return "system"
        return name

    def warm_up(self) -> None:
        """Start loading the local Qwen model in the background (first load ~40 s)."""
        if self.cfg.tts_engine != "qwen_local" or not model_downloaded(self.cfg.tts_qwen_model):
            return
        eng = self.engine("qwen_local")
        if isinstance(eng, QwenLocalEngine) and not eng.loaded:
            threading.Thread(target=self._safe_load, args=(eng,), daemon=True).start()

    @staticmethod
    def _safe_load(eng: QwenLocalEngine) -> None:
        try:
            eng.load()
        except Exception as e:
            logger.warning("Qwen3-TTS warm-up failed: %s", e)

    # --- status ---

    def playback_active(self) -> bool:
        return self._playing or (time.monotonic() - self._played_until) < PLAYBACK_RELEASE_S

    def status(self) -> dict:
        model = self.cfg.tts_qwen_model
        qwen = self._engines.get("qwen_local")
        return {
            "engine": self.cfg.tts_engine,
            "target_lang": self.cfg.tts_target_lang,
            "qwen_model": model,
            "qwen_languages": list(QWEN_LANGS),
            "qwen_voices": QWEN_VOICES,
            "downloaded": model_downloaded(model),
            "downloading": self.downloading,
            "downloaded_bytes": model_cache_bytes(model),
            "expected_bytes": EXPECTED_MODEL_BYTES.get(model),
            "download_error": self.download_error,
            "loaded": bool(isinstance(qwen, QwenLocalEngine) and qwen.loaded),
            "playing": self._playing,
            "current": self.current.event() if self.current else None,
            "system_voice": self.engine("system").voice_for(self.cfg.tts_target_lang)
            if isinstance(self.engine("system"), SystemEngine) else None,
        }

    def system_voices(self) -> list[dict]:
        eng = self.engine("system")
        return eng.voices() if isinstance(eng, SystemEngine) else []

    # --- download ---

    def start_download(self) -> bool:
        if self.downloading:
            return False
        self.downloading, self.download_error = True, ""
        model = self.cfg.tts_qwen_model

        def run() -> None:
            try:
                if self._downloader:
                    self._downloader(model)
                else:
                    from huggingface_hub import snapshot_download

                    snapshot_download(model)
            except Exception as e:
                logger.warning("Qwen3-TTS download failed: %s", e)
                self.download_error = str(e)
            finally:
                self.downloading = False

        threading.Thread(target=run, daemon=True).start()
        return True

    # --- queue ---

    def _emit(self, u: Utterance) -> None:
        if self._on_event:
            self._on_event(u.event())

    def _ensure_worker(self) -> None:
        if self._queue is None:
            self._queue = asyncio.Queue()
        if self._worker is None or self._worker.done():
            self._worker = asyncio.get_running_loop().create_task(self._run())

    async def speak(self, text: str, translate: bool = True, target_lang: str = "", source_lang: str = "") -> Utterance:
        text = (text or "").strip()
        if not text:
            raise ValueError("Text is empty")
        u = Utterance(
            id=next(_ids), original=text, lang=target_lang or self.cfg.tts_target_lang,
            source_lang=source_lang, translate=translate,
        )
        self._ensure_worker()
        self._stop.clear()
        self._emit(u)
        await self._queue.put(u)
        return u

    async def replay(self, utterance_id: int) -> Utterance:
        cached = self._cache.get(utterance_id)
        if cached is None or cached.audio is None:
            raise KeyError(utterance_id)
        u = Utterance(
            id=next(_ids), original=cached.original, text=cached.text, lang=cached.lang,
            translate=False, engine=cached.engine, audio=cached.audio, sample_rate=cached.sample_rate,
        )
        self._cache[u.id] = u  # a replay can be replayed again
        self._ensure_worker()
        self._stop.clear()
        self._emit(u)
        await self._queue.put(u)
        return u

    def stop(self) -> None:
        self._stop.set()
        if self._queue is not None:
            while not self._queue.empty():
                u = self._queue.get_nowait()
                u.status = "stopped"
                self._emit(u)

    async def _run(self) -> None:
        while True:
            u = await self._queue.get()
            if u.status == "stopped":
                continue
            self.current = u
            try:
                await self._prepare(u)
                if self._stop.is_set():
                    u.status = "stopped"
                    self._emit(u)
                    continue
                u.status = "playing"
                self._emit(u)
                self._playing = True
                try:
                    await asyncio.to_thread(self._player.play, u.audio, u.sample_rate, self.cfg.tts_output_device, self._stop)
                finally:
                    self._playing = False
                    self._played_until = time.monotonic()
                u.status = "stopped" if self._stop.is_set() else "done"
                self._emit(u)
            except Exception as e:
                logger.warning("Speak %d failed: %s", u.id, e)
                u.status, u.error = "error", str(e) or e.__class__.__name__
                self._emit(u)
            finally:
                self.current = None

    async def _prepare(self, u: Utterance) -> None:
        if u.audio is not None:
            return  # replay
        if u.translate:
            if self._translator is None or not self._translator.is_configured:
                raise RuntimeError("LLM not configured")
            u.text = await self._translator.translate_once(u.original, u.lang, u.source_lang)
        else:
            u.text = u.original
        u.engine = self.engine_for(u.lang)
        u.status = "synthesizing"
        self._emit(u)
        eng = self.engine(u.engine)
        audio, sr = await asyncio.to_thread(eng.synthesize, u.text, u.lang)
        u.audio, u.sample_rate = np.asarray(audio, dtype=np.float32), int(sr)
        self._cache[u.id] = u
        while len(self._cache) > REPLAY_CACHE_SIZE:
            self._cache.popitem(last=False)

    async def close(self) -> None:
        self.stop()
        if self._worker:
            self._worker.cancel()

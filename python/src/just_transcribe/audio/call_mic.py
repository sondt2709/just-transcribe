"""Call mic bridge: writes the real mic and the spoken translation into the virtual
device "Just Transcribe Microphone", which a meeting app selects as its microphone.

The driver (driver/) loops its output side back to its input side. The bridge opens
an OutputStream to that device; in mode voice_and_translation it also opens the
default input (real mic) at 48 kHz and mixes it with the TTS audio.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable, Optional

import numpy as np
import sounddevice as sd

from just_transcribe.audio import portaudio
from just_transcribe.config import CALL_MIC_MODES

logger = logging.getLogger(__name__)

DEVICE_NAME = "Just Transcribe Microphone"
RATE = 48000
BLOCK = 480  # 10 ms
MIC_LOW = RATE * 20 // 1000  # start reading (and restart after an underrun) at 20 ms
MIC_TARGET = RATE * 40 // 1000  # drop down to 40 ms ...
MIC_HIGH = RATE * 60 // 1000  # ... when more than 60 ms waits
WATCHDOG_S = 1.0
STALL_S = 2.0  # no output callback for this long: the stream died (e.g. Core Audio restarted)
MAX_RECOVERIES = 10


class MicBuffer:
    """Mic frames waiting for the virtual device. The two clocks drift: keep the
    fill between MIC_LOW and MIC_HIGH, drop the oldest frames when it grows, and
    write zeros when it runs out."""

    def __init__(self, low: int = MIC_LOW, target: int = MIC_TARGET, high: int = MIC_HIGH):
        self.low, self.target, self.high = low, target, high
        self._buf = np.zeros(high * 4, dtype=np.float32)
        self._n = 0
        self._primed = False
        self._lock = threading.Lock()
        self.dropped = 0
        self.max_fill = 0

    @property
    def fill(self) -> int:
        return self._n

    def write(self, x: np.ndarray) -> None:
        x = np.asarray(x, dtype=np.float32).reshape(-1)
        with self._lock:
            if len(x) > len(self._buf):
                x = x[-len(self._buf):]
            if self._n + len(x) > len(self._buf):
                keep = len(self._buf) - len(x)
                self._drop(self._n - keep)
            self._buf[self._n : self._n + len(x)] = x
            self._n += len(x)
            if self._n > self.high:
                self._drop(self._n - self.target)
            self.max_fill = max(self.max_fill, self._n)

    def _drop(self, k: int) -> None:
        self._buf[: self._n - k] = self._buf[k : self._n]
        self._n -= k
        self.dropped += k

    def read(self, n: int) -> np.ndarray:
        out = np.zeros(n, dtype=np.float32)
        with self._lock:
            if not self._primed:
                if self._n < self.low:
                    return out
                self._primed = True
            k = min(n, self._n)
            out[:k] = self._buf[:k]
            self._buf[: self._n - k] = self._buf[k : self._n]
            self._n -= k
            if k < n:
                self._primed = False  # underrun: wait for MIC_LOW again
        return out

    def clear(self) -> None:
        with self._lock:
            self._n, self._primed = 0, False


class TtsQueue:
    def __init__(self):
        self._items: list[np.ndarray] = []
        self._pos = 0
        self._lock = threading.Lock()

    def push(self, x: np.ndarray) -> None:
        with self._lock:
            self._items.append(x)

    def read(self, n: int) -> np.ndarray:
        out = np.zeros(n, dtype=np.float32)
        filled = 0
        with self._lock:
            while filled < n and self._items:
                cur = self._items[0]
                k = min(n - filled, len(cur) - self._pos)
                out[filled : filled + k] = cur[self._pos : self._pos + k]
                filled += k
                self._pos += k
                if self._pos >= len(cur):
                    self._items.pop(0)
                    self._pos = 0
        return out

    def clear(self) -> None:
        with self._lock:
            self._items, self._pos = [], 0

    @property
    def pending(self) -> int:
        with self._lock:
            return sum(len(x) for x in self._items) - self._pos


def to_mono_48k(audio: np.ndarray, sr: int) -> np.ndarray:
    x = np.asarray(audio, dtype=np.float32)
    if x.ndim == 2:
        x = x.mean(axis=1)
    if sr == RATE or len(x) == 0:
        return x.astype(np.float32, copy=False)
    try:
        from math import gcd

        from scipy.signal import resample_poly

        g = gcd(RATE, int(sr))
        return resample_poly(x, RATE // g, int(sr) // g).astype(np.float32)
    except ImportError:  # pragma: no cover - scipy comes with the ASR dependencies
        t = np.arange(int(len(x) * RATE / sr)) * (sr / RATE)
        return np.interp(t, np.arange(len(x)), x).astype(np.float32)


def find_device(devices, name: str = DEVICE_NAME) -> Optional[int]:
    for i, d in enumerate(devices):
        if d["name"] == name and d["max_output_channels"] > 0:
            return i
    return None


class CallMicBridge:
    """States: off, running, no_device, error."""

    def __init__(
        self,
        sd_module=sd,
        can_reload: Callable[[], bool] = lambda: True,
        device_name: str = DEVICE_NAME,
        watchdog_s: float = WATCHDOG_S,
    ):
        self._sd = sd_module
        self._can_reload = can_reload
        self.device_name = device_name
        self._watchdog_s = watchdog_s
        self._lock = portaudio.lock  # one lock with the PortAudio reload: no lock-order deadlock
        self.enabled = False
        self.mode = CALL_MIC_MODES[0]
        self.state = "off"
        self.error = ""
        self._in = None
        self._out = None
        self._channels = 2
        self._mic = MicBuffer()
        self._tts = TtsQueue()
        self._beat = 0.0
        self._recoveries = 0
        self._watchdog: Optional[threading.Thread] = None
        self._quit = threading.Event()

    # --- control ---

    def apply(self, enabled: bool, mode: str) -> None:
        mode = mode if mode in CALL_MIC_MODES else CALL_MIC_MODES[0]
        with self._lock:
            if enabled == self.enabled and mode == self.mode and (self.state == "running" or not enabled):
                return
            self.enabled, self.mode = enabled, mode
            self._close()
            if enabled:
                self._open(allow_reload=True)
            else:
                self.state, self.error = "off", ""
        if enabled:
            self._ensure_watchdog()

    def restart(self) -> None:
        """Try again, e.g. after the driver was installed (the PortAudio device list is stale)."""
        with self._lock:
            if not self.enabled:
                return
            self._close()
            self._recoveries = 0
            self._open(allow_reload=True)
        self._ensure_watchdog()

    def close(self) -> None:
        self._quit.set()
        with self._lock:
            self.enabled = False
            self._close()
            self.state, self.error = "off", ""

    def status(self) -> dict:
        return {"state": self.state, "mode": self.mode, "device": self.device_name, "error": self.error}

    @property
    def running(self) -> bool:
        return self.state == "running"

    # --- TTS ---

    def push_tts(self, audio: np.ndarray, sr: int) -> None:
        if self.running:
            self._tts.push(to_mono_48k(audio, sr))

    def clear_tts(self) -> None:
        self._tts.clear()

    # --- PortAudio reload (audio/portaudio.py) ---

    def suspend(self) -> bool:
        with self._lock:
            if self.state != "running":
                return False
            self._close_streams()
            return True

    def resume(self) -> None:
        with self._lock:
            if self.enabled:
                self._open(allow_reload=False)

    # --- streams ---

    def _open(self, allow_reload: bool) -> None:
        sd_ = self._sd
        try:
            idx = find_device(sd_.query_devices(), self.device_name)
            if idx is None and allow_reload and self._can_reload():
                portaudio.reload(sd_)
                idx = find_device(sd_.query_devices(), self.device_name)
            if idx is None:
                self.state, self.error = "no_device", f'"{self.device_name}" is not installed'
                return
            if self.mode == "voice_and_translation":
                default_in = sd_.query_devices(kind="input")
                if default_in["name"] == self.device_name:
                    raise RuntimeError(
                        f'The macOS input is "{self.device_name}". Select your real microphone in '
                        "System Settings → Sound → Input; select this device only in the meeting app."
                    )
            self._channels = max(1, min(2, int(sd_.query_devices(idx)["max_output_channels"])))
            self._mic.clear()
            self._beat = time.monotonic()
            self._out = sd_.OutputStream(
                device=idx, samplerate=RATE, channels=self._channels, dtype="float32",
                blocksize=BLOCK, latency="low", callback=self._on_output,
            )
            if self.mode == "voice_and_translation":
                self._in = sd_.InputStream(
                    samplerate=RATE, channels=1, dtype="float32",
                    blocksize=BLOCK, latency="low", callback=self._on_mic,
                )
                self._in.start()
            self._out.start()
            self.state, self.error = "running", ""
            portaudio.register(self)
            logger.info("Call mic running: %s, mode=%s", self.device_name, self.mode)
        except Exception as e:
            logger.warning("Call mic failed to start: %s", e)
            self._close_streams()
            self.state, self.error = "error", str(e) or e.__class__.__name__

    def _close_streams(self) -> None:
        for s in (self._in, self._out):
            if s is not None:
                try:
                    s.stop()
                    s.close()
                except Exception as e:
                    logger.debug("Closing a call mic stream failed: %s", e)
        self._in = self._out = None

    def _close(self) -> None:
        portaudio.unregister(self)
        self._close_streams()
        self._mic.clear()
        self._tts.clear()

    def _on_mic(self, indata, frames, _time, status) -> None:
        self._mic.write(indata[:, 0])

    def _on_output(self, outdata, frames, _time, status) -> None:
        self._beat = time.monotonic()
        mix = self._tts.read(frames)
        if self._in is not None:
            mix += self._mic.read(frames)
        np.clip(mix, -1.0, 1.0, out=mix)
        outdata[:] = mix.reshape(-1, 1)

    # --- watchdog: Core Audio restarts (driver install) stop the streams silently ---

    def _ensure_watchdog(self) -> None:
        if self._watchdog is None or not self._watchdog.is_alive():
            self._quit.clear()
            self._watchdog = threading.Thread(target=self._watch, daemon=True, name="call-mic-watchdog")
            self._watchdog.start()

    def _watch(self) -> None:
        while not self._quit.wait(self._watchdog_s):
            self.check()
            if not self.enabled:
                return

    def check(self) -> None:
        with self._lock:
            if not self.enabled:
                return
            stalled = self.state == "running" and time.monotonic() - self._beat > STALL_S
            retry = self.state in ("error", "no_device") and 0 < self._recoveries < MAX_RECOVERIES
            if not (stalled or retry) or self._recoveries >= MAX_RECOVERIES:
                return
            self._recoveries += 1
            logger.warning("Call mic stream stopped; reopening (try %d)", self._recoveries)
            self._close()
            self._open(allow_reload=True)
            if self.state == "running":
                self._recoveries = 0

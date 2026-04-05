"""Microphone audio capture via sounddevice."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import numpy as np
import sounddevice as sd

from just_transcribe.config import DEFAULT_SAMPLE_RATE

logger = logging.getLogger(__name__)


class MicCapture:
    """Captures audio from the default microphone at 16kHz mono float32."""

    def __init__(
        self,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        chunk_duration: float = 0.1,
    ):
        self.sample_rate = sample_rate
        self.chunk_samples = int(sample_rate * chunk_duration)
        self._stream: Optional[sd.InputStream] = None
        self._queue: asyncio.Queue[np.ndarray] = asyncio.Queue()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def _audio_callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: object,
        status: sd.CallbackFlags,
    ) -> None:
        if status:
            logger.warning("Mic status: %s", status)
        audio = indata[:, 0].copy()  # mono, float32
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, audio)

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="float32",
            blocksize=self.chunk_samples,
            callback=self._audio_callback,
        )
        self._stream.start()
        logger.info("Mic capture started (rate=%d)", self.sample_rate)

    async def stop(self) -> None:
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        logger.info("Mic capture stopped")

    async def get_chunk(self) -> np.ndarray:
        return await self._queue.get()

    @property
    def is_active(self) -> bool:
        return self._stream is not None and self._stream.active

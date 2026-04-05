"""System audio capture via audiotee subprocess."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from just_transcribe.config import AUDIOTEE_BIN, DEFAULT_SAMPLE_RATE

logger = logging.getLogger(__name__)


class SpeakerCapture:
    """Captures system audio by spawning audiotee and reading PCM from stdout."""

    def __init__(
        self,
        audiotee_path: Optional[Path] = None,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        chunk_duration: float = 0.2,
    ):
        self.audiotee_path = audiotee_path or AUDIOTEE_BIN
        self.sample_rate = sample_rate
        self.chunk_bytes = int(sample_rate * chunk_duration * 2)  # s16le = 2 bytes per sample
        self._process: Optional[asyncio.subprocess.Process] = None
        self._queue: asyncio.Queue[np.ndarray] = asyncio.Queue()
        self._reader_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        if not self.audiotee_path.exists():
            raise FileNotFoundError(
                f"audiotee binary not found at {self.audiotee_path}. "
                "Please ensure it's installed in ~/.just-transcribe/bin/"
            )

        self._process = await asyncio.create_subprocess_exec(
            str(self.audiotee_path),
            "--sample-rate",
            str(self.sample_rate),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._reader_task = asyncio.create_task(self._read_loop())
        logger.info("Speaker capture started (audiotee pid=%d)", self._process.pid)

    async def _read_loop(self) -> None:
        """Read PCM float32 data from audiotee stdout."""
        try:
            while self._process and self._process.stdout:
                data = await self._process.stdout.readexactly(self.chunk_bytes)
                # audiotee outputs s16le; convert to float32 [-1.0, 1.0]
                samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                await self._queue.put(samples)
        except asyncio.IncompleteReadError:
            logger.info("audiotee stdout closed (end of stream)")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Speaker read error: %s", e)

    async def stop(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
            self._reader_task = None

        if self._process:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                self._process.kill()
            self._process = None

        logger.info("Speaker capture stopped")

    async def get_chunk(self) -> np.ndarray:
        return await self._queue.get()

    @property
    def is_active(self) -> bool:
        return self._process is not None and self._process.returncode is None

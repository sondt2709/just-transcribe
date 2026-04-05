"""Unified dual-stream audio manager with source tagging."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator, Optional

import numpy as np

from just_transcribe.audio.mic import MicCapture
from just_transcribe.audio.speaker import SpeakerCapture

logger = logging.getLogger(__name__)


@dataclass
class AudioChunk:
    """An audio chunk tagged with its source."""

    samples: np.ndarray
    source: str  # "mic" or "speaker"


class AudioStreamManager:
    """Manages dual audio streams (mic + speaker) and yields source-tagged chunks."""

    def __init__(self, audiotee_path: Optional[Path] = None):
        self._mic = MicCapture()
        self._speaker = SpeakerCapture(audiotee_path=audiotee_path)
        self._running = False
        self._queue: asyncio.Queue[AudioChunk] = asyncio.Queue()
        self._tasks: list[asyncio.Task] = []

    async def start(self, mic: bool = True, speaker: bool = True) -> None:
        self._running = True

        if mic:
            await self._mic.start()
            self._tasks.append(asyncio.create_task(self._pump_mic()))

        if speaker:
            await self._speaker.start()
            self._tasks.append(asyncio.create_task(self._pump_speaker()))

        logger.info("Audio streams started (mic=%s, speaker=%s)", mic, speaker)

    async def _pump_mic(self) -> None:
        try:
            while self._running:
                chunk = await self._mic.get_chunk()
                await self._queue.put(AudioChunk(samples=chunk, source="mic"))
        except asyncio.CancelledError:
            pass

    async def _pump_speaker(self) -> None:
        try:
            while self._running:
                chunk = await self._speaker.get_chunk()
                await self._queue.put(AudioChunk(samples=chunk, source="speaker"))
        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        await self._mic.stop()
        await self._speaker.stop()
        logger.info("Audio streams stopped")

    async def chunks(self) -> AsyncIterator[AudioChunk]:
        """Yield source-tagged audio chunks from both streams."""
        while self._running:
            try:
                chunk = await asyncio.wait_for(self._queue.get(), timeout=0.5)
                yield chunk
            except asyncio.TimeoutError:
                continue

    @property
    def mic_active(self) -> bool:
        return self._mic.is_active

    @property
    def speaker_active(self) -> bool:
        return self._speaker.is_active

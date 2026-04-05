"""ASR engine wrapping mlx-qwen3-asr Session."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable

import numpy as np

from just_transcribe.config import DEFAULT_ASR_MODEL

logger = logging.getLogger(__name__)


@dataclass
class TranscriptSegment:
    """A transcribed speech segment."""

    id: int
    text: str
    source: str  # "mic" or "speaker"
    speaker: str  # "You" or "Others"
    lang: str  # detected language code
    start: float  # seconds
    end: float  # seconds


@runtime_checkable
class ASRProvider(Protocol):
    """Protocol for ASR engines (local or remote)."""

    @property
    def is_loaded(self) -> bool: ...

    def set_language(self, language: str) -> None: ...

    def transcribe_segment(
        self,
        audio: np.ndarray,
        source: str,
        start_time: float,
        end_time: float,
    ) -> Optional[TranscriptSegment]: ...


class ASREngine:
    """Single mlx-qwen3-asr Session processing both audio streams."""

    def __init__(self, model_name: str = DEFAULT_ASR_MODEL, language: str = ""):
        self._model_name = model_name
        self._language = language or None  # None = auto-detect
        self._session = None
        self._segment_counter = 0
        self._loaded = False

    def load_model(self) -> None:
        """Load the ASR model. Call once at startup."""
        from mlx_qwen3_asr.session import Session

        logger.info("Loading ASR model: %s", self._model_name)
        t0 = time.time()
        self._session = Session(model=self._model_name)
        self._loaded = True
        logger.info("ASR model loaded in %.1fs", time.time() - t0)

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def set_language(self, language: str) -> None:
        """Set language hint. Empty string = auto-detect."""
        self._language = language or None

    def transcribe_segment(
        self,
        audio: np.ndarray,
        source: str,
        start_time: float,
        end_time: float,
    ) -> Optional[TranscriptSegment]:
        """Transcribe a speech segment.

        Args:
            audio: Speech audio (float32, 16kHz mono)
            source: "mic" or "speaker"
            start_time: Segment start time in stream
            end_time: Segment end time in stream

        Returns:
            TranscriptSegment with text, language, and metadata.
        """
        if self._session is None:
            raise RuntimeError("ASR model not loaded. Call load_model() first.")

        try:
            result = self._session.transcribe(
                (audio, 16000),
                language=self._language,
            )

            text = result.text.strip()
            if not text:
                return None

            self._segment_counter += 1
            speaker = "You" if source == "mic" else "Others"

            return TranscriptSegment(
                id=self._segment_counter,
                text=text,
                source=source,
                speaker=speaker,
                lang=result.language or "unknown",
                start=start_time,
                end=end_time,
            )
        except Exception as e:
            logger.error("ASR transcription failed: %s", e)
            return None

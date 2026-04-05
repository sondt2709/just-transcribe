"""Voice Activity Detection using Silero VAD."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
import torch

from just_transcribe.config import (
    DEFAULT_SAMPLE_RATE,
    VAD_CHUNK_SAMPLES,
    VAD_MAX_SPEECH_S,
    VAD_MIN_SILENCE_S,
    VAD_MIN_SPEECH_S,
    VAD_NEG_THRESHOLD,
    VAD_THRESHOLD,
)

logger = logging.getLogger(__name__)


@dataclass
class SpeechSegment:
    """A detected speech segment."""

    samples: np.ndarray
    source: str  # "mic" or "speaker"
    start_time: float  # seconds from stream start
    end_time: float


class VoiceActivityDetector:
    """Silero VAD wrapper for detecting speech segments in audio streams."""

    def __init__(self, sample_rate: int = DEFAULT_SAMPLE_RATE):
        self.sample_rate = sample_rate
        self._model = None
        self._min_speech_samples = int(VAD_MIN_SPEECH_S * sample_rate)
        self._min_silence_samples = int(VAD_MIN_SILENCE_S * sample_rate)
        self._max_speech_samples = int(VAD_MAX_SPEECH_S * sample_rate)

        # Per-source state
        self._state: dict[str, _SourceState] = {}

    def _get_state(self, source: str) -> _SourceState:
        if source not in self._state:
            self._state[source] = _SourceState()
        return self._state[source]

    def load_model(self) -> None:
        """Load Silero VAD model."""
        self._model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            trust_repo=True,
        )
        logger.info("Silero VAD model loaded")

    def is_speech_active(self, source: str) -> bool:
        """Check if a source currently has active speech."""
        state = self._state.get(source)
        if state is None:
            return False
        return state.in_speech

    def get_pending_audio(self, source: str) -> Optional[np.ndarray]:
        """Get the current accumulated speech buffer without clearing it.

        Used for interim transcription — reads what's accumulated so far
        without waiting for silence to finalize.
        """
        state = self._state.get(source)
        if state is None or not state.in_speech or not state.speech_buffer:
            return None
        audio = np.concatenate(state.speech_buffer)
        if len(audio) < self._min_speech_samples:
            return None
        return audio

    def reset(self, source: Optional[str] = None) -> None:
        """Reset VAD state for a source or all sources."""
        if source:
            self._state.pop(source, None)
        else:
            self._state.clear()
        if self._model is not None:
            self._model.reset_states()

    def process_chunk(
        self, samples: np.ndarray, source: str, stream_time: float
    ) -> Optional[SpeechSegment]:
        """Process an audio chunk and return a speech segment if one completes.

        Args:
            samples: Audio samples (float32, 16kHz)
            source: "mic" or "speaker"
            stream_time: Current time offset in the stream (seconds)

        Returns:
            A SpeechSegment if a complete utterance was detected, else None.
        """
        if self._model is None:
            raise RuntimeError("VAD model not loaded. Call load_model() first.")

        state = self._get_state(source)
        state.buffer = np.concatenate([state.buffer, samples])

        # Process in 512-sample chunks (required by Silero)
        while len(state.buffer) >= VAD_CHUNK_SAMPLES:
            chunk = state.buffer[:VAD_CHUNK_SAMPLES]
            state.buffer = state.buffer[VAD_CHUNK_SAMPLES:]

            tensor = torch.from_numpy(chunk).float()
            prob = self._model(tensor, self.sample_rate).item()

            state.total_samples += VAD_CHUNK_SAMPLES
            current_time = stream_time - len(state.buffer) / self.sample_rate

            if prob >= VAD_THRESHOLD:
                if not state.in_speech:
                    state.in_speech = True
                    state.speech_start_time = current_time
                    state.speech_buffer = []
                state.speech_buffer.append(chunk)
                state.silence_samples = 0

                # Force-emit if segment exceeds max duration
                speech_samples = sum(len(b) for b in state.speech_buffer)
                if speech_samples >= self._max_speech_samples:
                    speech_audio = np.concatenate(state.speech_buffer)
                    speech_duration = len(speech_audio) / self.sample_rate
                    start_t = state.speech_start_time
                    state.in_speech = False
                    state.silence_samples = 0
                    state.speech_buffer = []
                    logger.debug("Force-emitting segment (%.1fs max reached)", speech_duration)
                    return SpeechSegment(
                        samples=speech_audio,
                        source=source,
                        start_time=start_t,
                        end_time=start_t + speech_duration,
                    )
            else:
                if state.in_speech:
                    state.speech_buffer.append(chunk)
                    state.silence_samples += VAD_CHUNK_SAMPLES

                    if state.silence_samples >= self._min_silence_samples:
                        # Speech segment complete
                        speech_audio = np.concatenate(state.speech_buffer)
                        speech_duration = len(speech_audio) / self.sample_rate

                        state.in_speech = False
                        state.silence_samples = 0
                        speech_buf = state.speech_buffer
                        start_t = state.speech_start_time
                        state.speech_buffer = []

                        if len(speech_audio) >= self._min_speech_samples:
                            return SpeechSegment(
                                samples=speech_audio,
                                source=source,
                                start_time=start_t,
                                end_time=start_t + speech_duration,
                            )

        return None

    def flush(self, source: str, stream_time: float) -> Optional[SpeechSegment]:
        """Flush any remaining speech for a source (call on stop)."""
        state = self._get_state(source)
        if state.in_speech and state.speech_buffer:
            speech_audio = np.concatenate(state.speech_buffer)
            if len(speech_audio) >= self._min_speech_samples:
                duration = len(speech_audio) / self.sample_rate
                segment = SpeechSegment(
                    samples=speech_audio,
                    source=source,
                    start_time=state.speech_start_time,
                    end_time=state.speech_start_time + duration,
                )
                state.in_speech = False
                state.speech_buffer = []
                return segment
        return None


class _SourceState:
    """Per-source VAD tracking state."""

    def __init__(self):
        self.buffer: np.ndarray = np.array([], dtype=np.float32)
        self.in_speech: bool = False
        self.speech_start_time: float = 0.0
        self.speech_buffer: list[np.ndarray] = []
        self.silence_samples: int = 0
        self.total_samples: int = 0

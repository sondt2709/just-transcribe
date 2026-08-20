"""Structured JSONL session tracing for pipeline diagnostics.

Each recording session gets a directory under ~/.just-transcribe/sessions/
containing events.jsonl (always) and WAV artifacts (only when debug_audio).
"""

from __future__ import annotations

import json
import logging
import shutil
import threading
import time
from collections import deque
from pathlib import Path
from typing import Optional

import numpy as np

from just_transcribe.config import DEFAULT_SAMPLE_RATE, SESSIONS_DIR

logger = logging.getLogger(__name__)

MAX_SESSIONS = 20
RING_BUFFER_S = 60.0


class _RingBuffer:
    """Rolling buffer of the last N seconds of raw audio for one source."""

    def __init__(self, max_seconds: float = RING_BUFFER_S, sample_rate: int = DEFAULT_SAMPLE_RATE):
        self._max_samples = int(max_seconds * sample_rate)
        self._chunks: deque[np.ndarray] = deque()
        self._total = 0
        self._lock = threading.Lock()

    def feed(self, samples: np.ndarray) -> None:
        with self._lock:
            self._chunks.append(samples)
            self._total += len(samples)
            while self._total > self._max_samples and self._chunks:
                dropped = self._chunks.popleft()
                self._total -= len(dropped)

    def snapshot(self) -> Optional[np.ndarray]:
        with self._lock:
            if not self._chunks:
                return None
            return np.concatenate(list(self._chunks))


class SessionTracer:
    """Writes JSONL trace events (and optional WAVs) for one recording session."""

    def __init__(self, debug_audio: bool = False):
        self.debug_audio = debug_audio
        self._prune_sessions()

        ts = time.strftime("%Y%m%d-%H%M%S")
        self.session_dir = SESSIONS_DIR / ts
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self._events_path = self.session_dir / "events.jsonl"
        self._file = open(self._events_path, "a", buffering=1)  # line-buffered
        self._write_lock = threading.Lock()
        self._trace_counter = 0
        self._counter_lock = threading.Lock()
        self._rings: dict[str, _RingBuffer] = {}
        logger.info("Trace session: %s (debug_audio=%s)", self.session_dir, debug_audio)

    # --- events ---

    def trace(self, event: str, **fields) -> None:
        """Append one event. Safe to call from any thread."""
        record = {"ts": round(time.time(), 3), "event": event, **fields}
        try:
            line = json.dumps(record, ensure_ascii=False, default=str)
            with self._write_lock:
                self._file.write(line + "\n")
        except Exception as e:
            logger.warning("Trace write failed: %s", e)

    def new_trace_id(self, source: str) -> str:
        with self._counter_lock:
            self._trace_counter += 1
            return f"{source}-{self._trace_counter}"

    # --- audio artifacts (debug_audio only) ---

    def save_wav(self, samples: np.ndarray, name: str) -> Optional[str]:
        """Save audio under the session dir. Returns relative path, or None if disabled."""
        if not self.debug_audio:
            return None
        try:
            import soundfile as sf

            seg_dir = self.session_dir / "segments"
            seg_dir.mkdir(exist_ok=True)
            path = seg_dir / f"{name}.wav"
            sf.write(path, samples, DEFAULT_SAMPLE_RATE, format="WAV", subtype="PCM_16")
            return str(path.relative_to(self.session_dir))
        except Exception as e:
            logger.warning("WAV save failed: %s", e)
            return None

    def feed_ring(self, source: str, samples: np.ndarray) -> None:
        if not self.debug_audio:
            return
        if source not in self._rings:
            self._rings[source] = _RingBuffer()
        self._rings[source].feed(samples)

    def dump_rings(self, reason: str) -> list[str]:
        """Dump all ring buffers to WAV. Returns saved paths."""
        if not self.debug_audio:
            return []
        saved = []
        ts = time.strftime("%H%M%S")
        for source, ring in self._rings.items():
            audio = ring.snapshot()
            if audio is None or len(audio) == 0:
                continue
            path = self.save_wav(audio, f"{reason}_{ts}_{source}")
            if path:
                saved.append(path)
        return saved

    def close(self) -> None:
        try:
            with self._write_lock:
                self._file.flush()
                self._file.close()
        except Exception:
            pass

    # --- housekeeping ---

    @staticmethod
    def _prune_sessions() -> None:
        try:
            SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
            sessions = sorted(
                (d for d in SESSIONS_DIR.iterdir() if d.is_dir()), key=lambda d: d.name
            )
            for old in sessions[: max(0, len(sessions) - (MAX_SESSIONS - 1))]:
                shutil.rmtree(old, ignore_errors=True)
        except Exception as e:
            logger.warning("Session pruning failed: %s", e)


class NullTracer:
    """No-op tracer used when no session is active (e.g., not recording)."""

    debug_audio = False
    session_dir = None

    def trace(self, event: str, **fields) -> None:
        pass

    def new_trace_id(self, source: str) -> str:
        return ""

    def save_wav(self, samples, name) -> Optional[str]:
        return None

    def feed_ring(self, source, samples) -> None:
        pass

    def dump_rings(self, reason) -> list[str]:
        return []

    def close(self) -> None:
        pass

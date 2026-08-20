"""Pipeline orchestrator: audio → VAD → ASR → translation → output."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Optional

import numpy as np

from just_transcribe.audio.stream import AudioChunk, AudioStreamManager
from just_transcribe.pipeline.asr import ASRProvider, TranscriptSegment
from just_transcribe.pipeline.translate import TranslationResult, TranslationService
from just_transcribe.pipeline.vad import SpeechSegment, VoiceActivityDetector
from just_transcribe.tracing import NullTracer, SessionTracer

logger = logging.getLogger(__name__)

# Callback types
SegmentCallback = Callable[[TranscriptSegment], None]
InterimCallback = Callable[[dict], None]
TranslationCallback = Callable[[TranslationResult], None]
ErrorCallback = Callable[[str], None]
StallCallback = Callable[[dict], None]

# Interim transcription interval
INTERIM_INTERVAL_S = 0.5
# Dedup: suppress cross-source duplicates within this time window
DEDUP_OVERLAP_S = 2.0
# Half-duplex: suppress mic for this long after speaker voice stops
MIC_SUPPRESS_RELEASE_S = 0.3
# Final-segment worker queue bound per source
FINAL_QUEUE_MAX = 8
# Heartbeat cadence
HEARTBEAT_INTERVAL_S = 1.0
# Watchdog: stall if speech seen but no output for this long
STALL_AFTER_S = 10.0
# Watchdog re-fire cooldown
STALL_COOLDOWN_S = 30.0
# stop(): max wait for in-flight ASR work
STOP_TIMEOUT_S = 10.0

_SOURCES = ["mic", "speaker"]


class PipelineOrchestrator:
    """Wires audio capture → VAD → ASR → translation as an async pipeline.

    Supports two transcription modes:
    - Interim: every 0.5s, transcribe accumulated audio (shown as updating text)
    - Final: when VAD detects silence, emit as a finalized sentence

    Final segments flow through a bounded per-source queue consumed by a worker
    task, so the VAD loop never blocks on ASR latency. GPU serialization is the
    local ASR engine's responsibility; remote ASR calls run unserialized.
    """

    def __init__(
        self,
        stream_manager: AudioStreamManager,
        vad: VoiceActivityDetector,
        asr: ASRProvider,
        translator: TranslationService,
        tracer: Optional[SessionTracer] = None,
    ):
        self._stream = stream_manager
        self._vad = vad
        self._asr = asr
        self._translator = translator
        self._tracer = tracer or NullTracer()
        self._running = False
        self._tasks: list[asyncio.Task] = []

        # Stream timing
        self._start_time: float = 0.0
        # Wall-clock epoch matching _start_time; wall time of a segment = wall_epoch + segment.start
        self.wall_epoch: float = 0.0

        # Recent transcripts for cross-source dedup
        self._recent_segments: list[TranscriptSegment] = []

        # Half-duplex: track when speaker last had voice
        self._speaker_voice_last: float = -10.0

        # Final-segment worker queues: source -> queue of (trace_id, SpeechSegment)
        self._final_queues: dict[str, asyncio.Queue] = {}
        self._workers: list[asyncio.Task] = []

        # Interim state (per source)
        self._interim_busy: dict[str, bool] = {s: False for s in _SOURCES}

        # Per-source trace id for the currently open speech segment
        self._current_trace_id: dict[str, str] = {}

        # Heartbeat / watchdog state (stream-elapsed seconds)
        self._chunk_counts: dict[str, int] = {s: 0 for s in _SOURCES}
        self._rms: dict[str, float] = {s: 0.0 for s in _SOURCES}
        self._inflight_asr = 0
        self._translate_tasks: set[asyncio.Task] = set()
        self._last_interim_t: float = 0.0
        self._last_segment_t: float = 0.0
        # When speech first appeared with no output produced yet (None = not waiting).
        # The stall clock starts here, not at the last output — otherwise resuming
        # speech after a long silence would instantly trip the watchdog.
        self._speech_pending_since: Optional[float] = None
        self._last_stall_t: float = -STALL_COOLDOWN_S
        self._ws_client_count: Callable[[], int] = lambda: -1

        # Callbacks
        self.on_segment: Optional[SegmentCallback] = None
        self.on_interim: Optional[InterimCallback] = None
        self.on_translation: Optional[TranslationCallback] = None
        self.on_error: Optional[ErrorCallback] = None
        self.on_stall: Optional[StallCallback] = None

    def _elapsed(self) -> float:
        return time.monotonic() - self._start_time

    async def start(self, mic: bool = True, speaker: bool = True) -> None:
        self._running = True
        self._start_time = time.monotonic()
        self.wall_epoch = time.time()
        self._last_interim_t = 0.0
        self._last_segment_t = 0.0

        await self._stream.start(mic=mic, speaker=speaker)

        for source in _SOURCES:
            self._final_queues[source] = asyncio.Queue(maxsize=FINAL_QUEUE_MAX)
            self._workers.append(asyncio.create_task(self._final_worker(source)))

        self._tasks.append(asyncio.create_task(self._vad_loop()))
        self._tasks.append(asyncio.create_task(self._interim_loop()))
        self._tasks.append(asyncio.create_task(self._heartbeat_loop()))
        self._tracer.trace("pipeline_start", mic=mic, speaker=speaker)
        logger.info("Pipeline started")

    async def stop(self) -> None:
        self._running = False
        elapsed = self._elapsed()

        # Stop producers first so no new work is enqueued
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        # Flush remaining VAD buffers into worker queues, then close queues
        for source in _SOURCES:
            segment = self._vad.flush(source, elapsed)
            if segment:
                trace_id = self._current_trace_id.get(source) or self._tracer.new_trace_id(source)
                self._tracer.trace(
                    "vad_flush", trace_id=trace_id, t=round(elapsed, 3),
                    source=source, duration_s=round(segment.end_time - segment.start_time, 3),
                )
                self._enqueue_final(trace_id, segment)
            queue = self._final_queues.get(source)
            if queue:
                try:
                    queue.put_nowait(None)  # sentinel: worker exits after draining
                except asyncio.QueueFull:
                    pass

        # Bounded wait for in-flight ASR work — never held hostage by a hung call
        if self._workers:
            done, pending = await asyncio.wait(self._workers, timeout=STOP_TIMEOUT_S)
            if pending:
                self._tracer.trace("stop_timeout", pending_workers=len(pending))
                logger.warning("Stop timeout: cancelling %d ASR worker(s)", len(pending))
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
        self._workers.clear()
        self._final_queues.clear()

        await self._stream.stop()

        # Give in-flight translations a short grace period, then cancel
        if self._translate_tasks:
            done, pending = await asyncio.wait(self._translate_tasks, timeout=5.0)
            for task in pending:
                task.cancel()
            self._translate_tasks.clear()

        await self._translator.close()
        self._vad.reset()
        self._tracer.trace("pipeline_stop")
        logger.info("Pipeline stopped")

    def set_ws_client_count(self, fn: Callable[[], int]) -> None:
        """Provide a callable returning current WebSocket client count (for heartbeat)."""
        self._ws_client_count = fn

    # --- VAD loop ---

    async def _vad_loop(self) -> None:
        """Consume audio chunks, run VAD. On silence → enqueue final segment."""
        try:
            async for chunk in self._stream.chunks():
                if not self._running:
                    break
                elapsed = self._elapsed()
                source = chunk.source

                self._chunk_counts[source] = self._chunk_counts.get(source, 0) + 1
                if len(chunk.samples):
                    self._rms[source] = float(np.sqrt(np.mean(chunk.samples**2)))
                self._tracer.feed_ring(source, chunk.samples)

                was_active = self._vad.is_speech_active(source)

                segment = self._vad.process_chunk(chunk.samples, source, elapsed)

                now_active = self._vad.is_speech_active(source)
                if now_active and not was_active:
                    trace_id = self._tracer.new_trace_id(source)
                    self._current_trace_id[source] = trace_id
                    self._tracer.trace(
                        "vad_speech_start", trace_id=trace_id, t=round(elapsed, 3), source=source
                    )
                if (now_active or segment) and self._speech_pending_since is None:
                    self._speech_pending_since = elapsed
                trace_id = self._current_trace_id.get(source, "")
                if was_active and not now_active:
                    if segment:
                        self._tracer.trace(
                            "vad_speech_end", trace_id=trace_id, t=round(elapsed, 3),
                            source=source,
                            duration_s=round(segment.end_time - segment.start_time, 3),
                        )
                    else:
                        # Speech ended but was too short to keep
                        self._tracer.trace(
                            "vad_drop_short", trace_id=trace_id, t=round(elapsed, 3), source=source
                        )
                elif segment:
                    # Still in speech but a segment was emitted → max-duration force emit
                    self._tracer.trace(
                        "vad_force_emit", trace_id=trace_id, t=round(elapsed, 3),
                        source=source,
                        duration_s=round(segment.end_time - segment.start_time, 3),
                    )

                # Update speaker voice timestamp
                if source == "speaker" and self._vad.is_speech_active("speaker"):
                    self._speaker_voice_last = elapsed

                # Half-duplex gating: suppress mic when speaker has voice
                if source == "mic":
                    time_since_speaker = elapsed - self._speaker_voice_last
                    speaker_active = self._vad.is_speech_active("speaker")
                    if speaker_active or time_since_speaker < MIC_SUPPRESS_RELEASE_S:
                        if segment:
                            self._tracer.trace(
                                "mic_gated", trace_id=trace_id, t=round(elapsed, 3),
                                reason="speaker_active" if speaker_active else "release_window",
                                had_segment=True,
                                duration_s=round(segment.end_time - segment.start_time, 3),
                            )
                            logger.debug("Suppressed mic segment (speaker active)")
                        continue

                # VAD emitted a final segment (silence detected)
                if segment:
                    self._enqueue_final(trace_id, segment)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("VAD loop error: %s", e)
            self._tracer.trace("vad_loop_error", error=str(e))
            if self.on_error:
                self.on_error(f"VAD error: {e}")

    def _enqueue_final(self, trace_id: str, speech: SpeechSegment) -> None:
        """Put a finalized segment on its source worker queue; drop oldest on overflow."""
        queue = self._final_queues.get(speech.source)
        if queue is None:
            return
        item = (trace_id, speech)
        try:
            queue.put_nowait(item)
        except asyncio.QueueFull:
            try:
                dropped_id, dropped = queue.get_nowait()
                self._tracer.trace(
                    "segment_dropped", trace_id=dropped_id, source=dropped.source,
                    duration_s=round(dropped.end_time - dropped.start_time, 3),
                    reason="queue_overflow",
                )
                logger.warning("ASR queue overflow (%s): dropped oldest segment", speech.source)
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(item)
            except asyncio.QueueFull:
                pass

    # --- Final segment workers ---

    async def _final_worker(self, source: str) -> None:
        """Consume finalized segments for one source: ASR → dedup → emit → translate."""
        queue = self._final_queues[source]
        while True:
            item = await queue.get()
            if item is None:  # sentinel from stop()
                break
            trace_id, speech = item
            try:
                await self._transcribe_final(trace_id, speech)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("Final ASR error: %s", e)
                self._tracer.trace("asr_worker_error", trace_id=trace_id, error=str(e))
                if self.on_error:
                    self.on_error(f"ASR error: {e}")

    async def _run_asr(
        self,
        trace_id: str,
        kind: str,
        audio: np.ndarray,
        source: str,
        start_time: float,
        end_time: float,
    ) -> Optional[TranscriptSegment]:
        """Run one ASR call in the executor with tracing. No orchestrator-level lock."""
        audio_s = len(audio) / 16000
        wav_path = None
        if kind == "final":
            wav_path = self._tracer.save_wav(audio, f"{trace_id}_{kind}")
        self._tracer.trace(
            "asr_call", trace_id=trace_id, t=round(self._elapsed(), 3),
            source=source, kind=kind, audio_s=round(audio_s, 3),
            provider=type(self._asr).__name__, wav=wav_path,
        )
        t0 = time.monotonic()
        self._inflight_asr += 1
        try:
            segment = await asyncio.get_running_loop().run_in_executor(
                None, self._asr.transcribe_segment, audio, source, start_time, end_time
            )
        finally:
            self._inflight_asr -= 1
        latency = time.monotonic() - t0
        self._tracer.trace(
            "asr_done", trace_id=trace_id, t=round(self._elapsed(), 3),
            source=source, kind=kind, latency_s=round(latency, 3),
            lock_wait_s=round(getattr(self._asr, "last_lock_wait_s", 0.0), 3),
            text=segment.text if segment else None,
            lang=segment.lang if segment else None,
        )
        return segment

    async def _transcribe_final(self, trace_id: str, speech: SpeechSegment) -> None:
        """Transcribe a finalized speech segment and emit it."""
        segment = await self._run_asr(
            trace_id, "final", speech.samples, speech.source,
            speech.start_time, speech.end_time,
        )
        if not segment:
            return

        self._last_segment_t = self._elapsed()
        self._speech_pending_since = None

        if self._is_duplicate(trace_id, segment):
            return

        self._recent_segments.append(segment)

        if self.on_segment:
            self.on_segment(segment)

        if self._translator.get_translation_targets(segment):
            task = asyncio.create_task(self._translate(trace_id, segment))
            self._translate_tasks.add(task)
            task.add_done_callback(self._translate_tasks.discard)

    # --- Interim loop ---

    async def _interim_loop(self) -> None:
        """Every 0.5s, transcribe accumulated speech as interim results (per source)."""
        try:
            while self._running:
                await asyncio.sleep(INTERIM_INTERVAL_S)
                if not self._running:
                    continue

                elapsed = self._elapsed()

                for source in _SOURCES:
                    if self._interim_busy[source]:
                        continue

                    # Skip mic if speaker is active (half-duplex)
                    if source == "mic":
                        time_since_speaker = elapsed - self._speaker_voice_last
                        if self._vad.is_speech_active("speaker") or time_since_speaker < MIC_SUPPRESS_RELEASE_S:
                            continue

                    audio = self._vad.get_pending_audio(source)
                    if audio is None:
                        continue

                    self._interim_busy[source] = True
                    task = asyncio.create_task(self._interim_transcribe(source, audio, elapsed))
                    task.add_done_callback(lambda _t, s=source: self._interim_busy.__setitem__(s, False))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Interim loop error: %s", e)
            self._tracer.trace("interim_loop_error", error=str(e))

    async def _interim_transcribe(self, source: str, audio: np.ndarray, elapsed: float) -> None:
        try:
            trace_id = self._current_trace_id.get(source, "")
            segment = await self._run_asr(
                trace_id, "interim", audio, source, elapsed - len(audio) / 16000, elapsed
            )
            if segment:
                self._last_interim_t = self._elapsed()
                self._speech_pending_since = None
                if self.on_interim:
                    self.on_interim({
                        "source": segment.source,
                        "speaker": segment.speaker,
                        "text": segment.text,
                        "lang": segment.lang,
                    })
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("Interim ASR error: %s", e)

    # --- Dedup ---

    def _is_duplicate(self, trace_id: str, segment: TranscriptSegment) -> bool:
        """Check if segment is a cross-source duplicate of a recent transcript."""
        now = segment.end
        self._recent_segments = [
            s for s in self._recent_segments if now - s.end < DEDUP_OVERLAP_S * 2
        ]

        for prev in self._recent_segments:
            if prev.source == segment.source:
                continue
            time_gap = abs(segment.start - prev.start)
            if time_gap > DEDUP_OVERLAP_S:
                continue
            words_a = set(segment.text.lower().split())
            words_b = set(prev.text.lower().split())
            if not words_a or not words_b:
                continue
            overlap = len(words_a & words_b)
            similarity = overlap / max(len(words_a), len(words_b))
            if similarity > 0.5:
                self._tracer.trace(
                    "dedup_drop", trace_id=trace_id, t=round(self._elapsed(), 3),
                    source=segment.source, other_source=prev.source,
                    similarity=round(similarity, 3), text=segment.text,
                )
                logger.debug(
                    "Suppressing duplicate: %r ≈ %r (%.0f%%)",
                    segment.text[:40], prev.text[:40], similarity * 100,
                )
                return True
        return False

    # --- Translation ---

    async def _translate(self, trace_id: str, segment: TranscriptSegment) -> None:
        """Translate a segment to all applicable targets and emit results."""
        try:
            results = await self._translator.translate_multi(segment, trace_id=trace_id)
            for result in results:
                if self.on_translation:
                    self.on_translation(result)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("Translation error: %s", e)
            self._tracer.trace("translate_error", trace_id=trace_id, error=str(e))

    # --- Heartbeat & stall watchdog ---

    async def _heartbeat_loop(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(HEARTBEAT_INTERVAL_S)
                if not self._running:
                    break
                elapsed = self._elapsed()
                chunks = dict(self._chunk_counts)
                self._chunk_counts = {s: 0 for s in _SOURCES}

                snapshot = {
                    "t": round(elapsed, 3),
                    "chunks_mic": chunks.get("mic", 0),
                    "chunks_speaker": chunks.get("speaker", 0),
                    "rms_mic": round(self._rms.get("mic", 0.0), 4),
                    "rms_speaker": round(self._rms.get("speaker", 0.0), 4),
                    "vad_mic": self._vad.is_speech_active("mic"),
                    "vad_speaker": self._vad.is_speech_active("speaker"),
                    "mic_gated": (
                        self._vad.is_speech_active("speaker")
                        or (elapsed - self._speaker_voice_last) < MIC_SUPPRESS_RELEASE_S
                    ),
                    "asr_lock_held_s": round(getattr(self._asr, "lock_held_s", 0.0), 3),
                    "inflight_asr": self._inflight_asr,
                    "inflight_translate": len(self._translate_tasks),
                    "queued_mic": self._final_queues["mic"].qsize() if "mic" in self._final_queues else 0,
                    "queued_speaker": self._final_queues["speaker"].qsize() if "speaker" in self._final_queues else 0,
                    "last_interim_age_s": round(elapsed - self._last_interim_t, 1),
                    "last_segment_age_s": round(elapsed - self._last_segment_t, 1),
                    "speech_pending_s": (
                        round(elapsed - self._speech_pending_since, 1)
                        if self._speech_pending_since is not None
                        else 0.0
                    ),
                    "ws_clients": self._ws_client_count(),
                }
                self._tracer.trace("heartbeat", **snapshot)
                self._check_stall(elapsed, chunks, snapshot)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Heartbeat loop error: %s", e)

    def _check_stall(self, elapsed: float, chunks: dict[str, int], snapshot: dict) -> None:
        audio_flowing = sum(chunks.values()) > 0
        pending_since = self._speech_pending_since
        if pending_since is None:
            return
        wait_s = elapsed - pending_since

        if not (audio_flowing and wait_s >= STALL_AFTER_S):
            return
        if elapsed - self._last_stall_t < STALL_COOLDOWN_S:
            return

        self._last_stall_t = elapsed

        # Best-effort guess at the stuck stage for the user-facing message
        if snapshot["asr_lock_held_s"] > 5.0 or snapshot["inflight_asr"] > 0:
            stage = "asr"
        elif snapshot["queued_mic"] + snapshot["queued_speaker"] > 0:
            stage = "asr_queue"
        else:
            stage = "unknown"

        dumps = self._tracer.dump_rings("stall")
        self._tracer.trace("stall", stage=stage, ring_dumps=dumps, **snapshot)
        logger.warning("Pipeline stall detected (stage=%s, speech unanswered for %.0fs)", stage, wait_s)
        if self.on_stall:
            self.on_stall({
                "stage": stage,
                "message": f"Speech detected but no transcription for {wait_s:.0f}s (stage: {stage})",
            })

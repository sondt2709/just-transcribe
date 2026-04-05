"""Pipeline orchestrator: audio → VAD → ASR → translation → output."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Optional

from just_transcribe.audio.stream import AudioChunk, AudioStreamManager
from just_transcribe.pipeline.asr import ASREngine, TranscriptSegment
from just_transcribe.pipeline.translate import TranslationResult, TranslationService
from just_transcribe.pipeline.vad import SpeechSegment, VoiceActivityDetector

logger = logging.getLogger(__name__)

# Callback types
SegmentCallback = Callable[[TranscriptSegment], None]
InterimCallback = Callable[[dict], None]
TranslationCallback = Callable[[TranslationResult], None]
ErrorCallback = Callable[[str], None]

# Interim transcription interval
INTERIM_INTERVAL_S = 0.5
# Dedup: suppress cross-source duplicates within this time window
DEDUP_OVERLAP_S = 2.0
# Half-duplex: suppress mic for this long after speaker voice stops
MIC_SUPPRESS_RELEASE_S = 0.3


class PipelineOrchestrator:
    """Wires audio capture → VAD → ASR → translation as an async pipeline.

    Supports two transcription modes:
    - Interim: every 0.5s, transcribe accumulated audio (shown as updating text)
    - Final: when VAD detects silence, emit as a finalized sentence
    """

    def __init__(
        self,
        stream_manager: AudioStreamManager,
        vad: VoiceActivityDetector,
        asr: ASREngine,
        translator: TranslationService,
    ):
        self._stream = stream_manager
        self._vad = vad
        self._asr = asr
        self._translator = translator
        self._running = False
        self._tasks: list[asyncio.Task] = []

        # Stream timing
        self._start_time: float = 0.0

        # Recent transcripts for cross-source dedup
        self._recent_segments: list[TranscriptSegment] = []

        # Half-duplex: track when speaker last had voice
        self._speaker_voice_last: float = -10.0

        # ASR lock: MLX/Metal doesn't support concurrent GPU access
        self._asr_lock = asyncio.Lock()

        # Interim state
        self._interim_busy = False

        # Callbacks
        self.on_segment: Optional[SegmentCallback] = None
        self.on_interim: Optional[InterimCallback] = None
        self.on_translation: Optional[TranslationCallback] = None
        self.on_error: Optional[ErrorCallback] = None

    async def start(self, mic: bool = True, speaker: bool = True) -> None:
        self._running = True
        self._start_time = time.monotonic()

        await self._stream.start(mic=mic, speaker=speaker)

        self._tasks.append(asyncio.create_task(self._vad_loop()))
        self._tasks.append(asyncio.create_task(self._interim_loop()))
        logger.info("Pipeline started")

    async def stop(self) -> None:
        self._running = False

        # Flush remaining VAD buffers — transcribe as final
        elapsed = time.monotonic() - self._start_time
        for source in ["mic", "speaker"]:
            segment = self._vad.flush(source, elapsed)
            if segment:
                await self._transcribe_final(segment)

        await self._stream.stop()

        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        await self._translator.close()
        self._vad.reset()
        logger.info("Pipeline stopped")

    async def _vad_loop(self) -> None:
        """Consume audio chunks, run VAD. On silence → finalize segment."""
        try:
            async for chunk in self._stream.chunks():
                if not self._running:
                    break
                elapsed = time.monotonic() - self._start_time

                # Process chunk through VAD
                segment = self._vad.process_chunk(
                    chunk.samples, chunk.source, elapsed
                )

                # Update speaker voice timestamp
                if chunk.source == "speaker" and self._vad.is_speech_active("speaker"):
                    self._speaker_voice_last = elapsed

                # Half-duplex gating: suppress mic when speaker has voice
                if chunk.source == "mic":
                    time_since_speaker = elapsed - self._speaker_voice_last
                    if self._vad.is_speech_active("speaker") or time_since_speaker < MIC_SUPPRESS_RELEASE_S:
                        if segment:
                            logger.debug("Suppressed mic segment (speaker active)")
                        continue

                # VAD emitted a final segment (silence detected)
                if segment:
                    await self._transcribe_final(segment)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("VAD loop error: %s", e)
            if self.on_error:
                self.on_error(f"VAD error: {e}")

    async def _interim_loop(self) -> None:
        """Every 0.5s, transcribe accumulated speech as interim results."""
        try:
            while self._running:
                await asyncio.sleep(INTERIM_INTERVAL_S)
                if not self._running or self._interim_busy:
                    continue

                elapsed = time.monotonic() - self._start_time

                # Check each source for pending speech
                for source in ["mic", "speaker"]:
                    # Skip mic if speaker is active (half-duplex)
                    if source == "mic":
                        time_since_speaker = elapsed - self._speaker_voice_last
                        if self._vad.is_speech_active("speaker") or time_since_speaker < MIC_SUPPRESS_RELEASE_S:
                            continue

                    audio = self._vad.get_pending_audio(source)
                    if audio is None:
                        continue

                    # Run ASR on accumulated audio (interim)
                    self._interim_busy = True
                    try:
                        async with self._asr_lock:
                            segment = await asyncio.get_running_loop().run_in_executor(
                                None,
                                self._asr.transcribe_segment,
                                audio,
                                source,
                                elapsed - len(audio) / 16000,
                                elapsed,
                            )
                        if segment and self.on_interim:
                            self.on_interim({
                                "source": segment.source,
                                "speaker": segment.speaker,
                                "text": segment.text,
                                "lang": segment.lang,
                            })
                    except Exception as e:
                        logger.warning("Interim ASR error: %s", e)
                    finally:
                        self._interim_busy = False

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Interim loop error: %s", e)

    async def _transcribe_final(self, speech: SpeechSegment) -> None:
        """Transcribe a finalized speech segment and emit it."""
        try:
            async with self._asr_lock:
                segment = await asyncio.get_running_loop().run_in_executor(
                    None,
                    self._asr.transcribe_segment,
                    speech.samples,
                    speech.source,
                    speech.start_time,
                    speech.end_time,
                )

            if segment:
                if self._is_duplicate(segment):
                    return

                self._recent_segments.append(segment)

                if self.on_segment:
                    self.on_segment(segment)

                if self._translator.should_translate(segment):
                    asyncio.create_task(self._translate(segment))

        except Exception as e:
            logger.error("Final ASR error: %s", e)
            if self.on_error:
                self.on_error(f"ASR error: {e}")

    def _is_duplicate(self, segment: TranscriptSegment) -> bool:
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
                logger.debug(
                    "Suppressing duplicate: %r ≈ %r (%.0f%%)",
                    segment.text[:40], prev.text[:40], similarity * 100,
                )
                return True
        return False

    async def _translate(self, segment: TranscriptSegment) -> None:
        """Translate a segment and emit the result."""
        try:
            result = await self._translator.translate(segment)
            if result and self.on_translation:
                self.on_translation(result)
        except Exception as e:
            logger.warning("Translation error: %s", e)

"""The orchestrator drops mic segments while the app itself is speaking (TTS)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import numpy as np

from just_transcribe.pipeline.orchestrator import PipelineOrchestrator
from just_transcribe.pipeline.vad import SpeechSegment
from just_transcribe.tracing import NullTracer


class FakeStream:
    def __init__(self, chunks):
        self._chunks = chunks

    async def chunks(self):
        for c in self._chunks:
            yield c


class FakeVAD:
    """Every chunk completes a speech segment immediately."""

    def is_speech_active(self, source):
        return False

    def process_chunk(self, samples, source, t):
        return SpeechSegment(samples=samples, source=source, start_time=0.0, end_time=1.0)


class RecordingTracer(NullTracer):
    def __init__(self):
        self.events = []

    def trace(self, event, **fields):
        self.events.append((event, fields))


def run_loop(playback: bool):
    chunk = SimpleNamespace(source="mic", samples=np.ones(512, dtype=np.float32) * 0.1)
    tracer = RecordingTracer()
    orch = PipelineOrchestrator(FakeStream([chunk]), FakeVAD(), asr=None, translator=None, tracer=tracer)
    orch._running = True
    orch._start_time = 0.0
    orch._speaker_voice_last = -100.0
    enqueued = []
    orch._enqueue_final = lambda trace_id, seg: enqueued.append(seg)
    orch.set_playback_probe(lambda: playback)
    asyncio.run(orch._vad_loop())
    return enqueued, tracer.events


def test_mic_segment_dropped_while_app_speaks():
    enqueued, events = run_loop(playback=True)
    assert enqueued == []
    gated = [f for e, f in events if e == "mic_gated"]
    assert gated and gated[0]["reason"] == "tts_playback"


def test_mic_segment_kept_when_app_is_silent():
    enqueued, events = run_loop(playback=False)
    assert len(enqueued) == 1
    assert not [e for e, _ in events if e == "mic_gated"]

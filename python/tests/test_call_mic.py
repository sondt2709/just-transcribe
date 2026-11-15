"""Call mic bridge: mixer, modes, drift handling, device lookup, reload and recovery, with fake streams."""

from __future__ import annotations

import time

import numpy as np
import pytest

from just_transcribe.audio import call_mic, portaudio
from just_transcribe.audio.call_mic import (
    BLOCK,
    DEVICE_NAME,
    MIC_HIGH,
    MIC_LOW,
    RATE,
    CallMicBridge,
    MicBuffer,
    to_mono_48k,
)

MAC_MIC = {"name": "MacBook Pro Microphone", "max_input_channels": 1, "max_output_channels": 0}
SPEAKERS = {"name": "MacBook Pro Speakers", "max_input_channels": 0, "max_output_channels": 2}
VIRTUAL = {"name": DEVICE_NAME, "max_input_channels": 2, "max_output_channels": 2}


class FakeStream:
    def __init__(self, sd, kind, **kw):
        self.sd, self.kind, self.kw = sd, kind, kw
        self.active = False
        sd.opened.append(self)

    def start(self):
        self.active = True

    def stop(self):
        self.active = False

    def close(self):
        self.sd.closed.append(self)


class FakeSD:
    class PortAudioError(Exception):
        pass

    def __init__(self, devices, default_in=MAC_MIC, after_reload=None):
        self.devices = list(devices)
        self.default_in = default_in
        self.after_reload = after_reload
        self.opened: list[FakeStream] = []
        self.closed: list[FakeStream] = []
        self.calls: list[str] = []

    def query_devices(self, device=None, kind=None):
        if kind == "input":
            return self.default_in
        if device is not None:
            return self.devices[device]
        return self.devices

    def OutputStream(self, **kw):
        return FakeStream(self, "out", **kw)

    def InputStream(self, **kw):
        return FakeStream(self, "in", **kw)

    def _terminate(self):
        self.calls.append("_terminate")

    def _initialize(self):
        self.calls.append("_initialize")
        if self.after_reload is not None:
            self.devices = self.after_reload


def streams(sd, kind):
    return [s for s in sd.opened if s.kind == kind and s not in sd.closed]


def pull(stream, frames=BLOCK):
    out = np.zeros((frames, stream.kw["channels"]), dtype=np.float32)
    stream.kw["callback"](out, frames, None, None)
    return out


def push_mic(stream, x):
    stream.kw["callback"](np.asarray(x, dtype=np.float32).reshape(-1, 1), len(x), None, None)


@pytest.fixture
def bridge_factory():
    made = []

    def make(sd, **kw):
        b = CallMicBridge(sd_module=sd, watchdog_s=3600, **kw)
        made.append(b)
        return b

    yield make
    for b in made:
        b.close()


# --- modes and mixer ---


def test_translation_only_opens_no_input_and_plays_tts(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "translation_only")
    assert b.status() == {"state": "running", "mode": "translation_only", "device": DEVICE_NAME, "error": ""}
    assert streams(sd, "in") == []
    (out,) = streams(sd, "out")
    assert out.kw["device"] == 2 and out.kw["samplerate"] == RATE and out.kw["channels"] == 2

    assert not pull(out).any()  # silence when nothing is spoken
    b.push_tts(np.full(BLOCK, 0.25, dtype=np.float32), RATE)
    frame = pull(out)
    assert np.allclose(frame, 0.25)  # same samples on both channels
    assert not pull(out).any()


def test_voice_and_translation_mixes_and_clips(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "voice_and_translation")
    (inp,) = streams(sd, "in")
    (out,) = streams(sd, "out")
    assert "device" not in inp.kw  # the default input (real mic)
    assert inp.kw["samplerate"] == RATE

    push_mic(inp, np.full(MIC_LOW, 0.5))
    assert np.allclose(pull(out), 0.5)  # mic passes through
    push_mic(inp, np.full(BLOCK, 0.75))
    b.push_tts(np.full(BLOCK, 0.75, dtype=np.float32), RATE)
    assert np.allclose(pull(out), 1.0)  # mic 0.5 (still waiting) + tts 0.75, clipped to 1


def test_mode_change_reopens_streams(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "voice_and_translation")
    assert len(streams(sd, "in")) == 1
    b.apply(True, "translation_only")
    assert streams(sd, "in") == [] and len(streams(sd, "out")) == 1


def test_turn_off_closes_streams(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "voice_and_translation")
    b.apply(False, "voice_and_translation")
    assert streams(sd, "in") == [] and streams(sd, "out") == []
    assert b.state == "off"
    b.push_tts(np.ones(10), RATE)  # ignored while off
    assert b._tts.pending == 0


def test_no_device_reloads_once_then_reports(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS])
    b = bridge_factory(sd)
    b.apply(True, "translation_only")
    assert b.state == "no_device" and sd.calls == ["_terminate", "_initialize"]
    assert sd.opened == []


def test_device_found_after_reload(bridge_factory):
    """The driver was installed after the backend started: PortAudio's list is stale."""
    sd = FakeSD([MAC_MIC, SPEAKERS], after_reload=[MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "translation_only")
    assert b.state == "running" and streams(sd, "out")[0].kw["device"] == 2


def test_no_reload_while_recording(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS], after_reload=[MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd, can_reload=lambda: False)
    b.apply(True, "translation_only")
    assert b.state == "no_device" and sd.calls == []


def test_refuses_when_macos_input_is_the_virtual_device(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL], default_in=VIRTUAL)
    b = bridge_factory(sd)
    b.apply(True, "voice_and_translation")
    assert b.state == "error" and "System Settings" in b.error
    assert streams(sd, "out") == [] and streams(sd, "in") == []
    b.apply(True, "translation_only")  # no mic needed
    assert b.state == "running"


def test_portaudio_reload_suspends_and_resumes_the_bridge(bridge_factory):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "voice_and_translation")
    first = streams(sd, "out")[0]
    portaudio.reload(sd)  # e.g. MicCapture.start
    assert first in sd.closed
    assert b.state == "running" and len(streams(sd, "out")) == 1 and len(streams(sd, "in")) == 1
    b.apply(False, "voice_and_translation")
    opened = len(sd.opened)
    portaudio.reload(sd)  # unregistered: nothing reopened
    assert len(sd.opened) == opened


def test_watchdog_reopens_a_stalled_stream(bridge_factory, monkeypatch):
    sd = FakeSD([MAC_MIC, SPEAKERS, VIRTUAL])
    b = bridge_factory(sd)
    b.apply(True, "translation_only")
    first = streams(sd, "out")[0]
    b.check()
    assert streams(sd, "out") == [first]  # callbacks recent: nothing to do
    b._beat = time.monotonic() - call_mic.STALL_S - 1  # no callback: Core Audio restarted
    b.check()
    assert first in sd.closed and len(streams(sd, "out")) == 1 and b.state == "running"


# --- drift ---


def test_mic_faster_than_device_never_waits_over_60ms():
    """Mic delivers 1% more frames than the device reads, for 60 seconds."""
    buf = MicBuffer()
    written = read = 0
    for _ in range(60 * RATE // BLOCK):
        buf.write(np.ones(BLOCK + BLOCK // 100 + (1 if written % 7 else 0), dtype=np.float32) * 0.1)
        written += 1
        buf.read(BLOCK)
        read += 1
        assert buf.fill <= MIC_HIGH
    assert buf.max_fill <= MIC_HIGH and buf.dropped > 0


def test_mic_slower_than_device_pads_with_zeros():
    buf = MicBuffer()
    buf.write(np.ones(MIC_LOW, dtype=np.float32))
    out = buf.read(BLOCK)
    assert np.all(out == 1)
    out = buf.read(BLOCK * 2)  # only BLOCK frames left
    assert np.all(out[:BLOCK] == 1) and np.all(out[BLOCK:] == 0)
    buf.write(np.ones(BLOCK, dtype=np.float32))  # below MIC_LOW again: wait
    assert not buf.read(BLOCK).any()


def test_resample_to_48k_mono():
    sr = 22050
    t = np.arange(sr) / sr
    stereo = np.stack([np.sin(2 * np.pi * 440 * t)] * 2, axis=1).astype(np.float32)
    y = to_mono_48k(stereo, sr)
    assert y.ndim == 1 and abs(len(y) - RATE) <= 1
    spec = np.abs(np.fft.rfft(y))
    assert abs(np.argmax(spec) * RATE / len(y) - 440) < 2

"""MicCapture must reload PortAudio before it opens the input stream.

PortAudio reads the device list one time per process. After a device change
(for example, a Bluetooth headset reconnects), a stream opened with the old
list fails with PaErrorCode -9986.
"""

from __future__ import annotations

import asyncio

import pytest

from just_transcribe.audio import mic as mic_module
from just_transcribe.audio.mic import MicCapture


class FakeStream:
    def __init__(self, calls: list[str], **kwargs):
        calls.append("InputStream")
        self.active = False

    def start(self):
        self.active = True

    def stop(self):
        self.active = False

    def close(self):
        pass


@pytest.fixture
def calls(monkeypatch) -> list[str]:
    calls: list[str] = []
    sd = mic_module.sd
    monkeypatch.setattr(sd, "InputStream", lambda **kw: FakeStream(calls, **kw))
    monkeypatch.setattr(sd, "_terminate", lambda: calls.append("_terminate"))
    monkeypatch.setattr(sd, "_initialize", lambda: calls.append("_initialize"))
    return calls


def test_start_reloads_portaudio_before_opening_stream(calls):
    capture = MicCapture()
    asyncio.run(capture.start())

    assert calls == ["_terminate", "_initialize", "InputStream"]
    assert capture.is_active


def test_start_reloads_on_every_start(calls):
    capture = MicCapture()

    async def start_stop_start():
        await capture.start()
        await capture.stop()
        await capture.start()

    asyncio.run(start_stop_start())

    assert calls == ["_terminate", "_initialize", "InputStream"] * 2


def test_start_opens_stream_when_terminate_fails(calls, monkeypatch):
    sd = mic_module.sd

    def failing_terminate():
        calls.append("_terminate")
        raise sd.PortAudioError("PortAudio not initialized")

    monkeypatch.setattr(sd, "_terminate", failing_terminate)

    asyncio.run(MicCapture().start())

    assert calls == ["_terminate", "_initialize", "InputStream"]


def test_start_opens_stream_when_reload_functions_are_missing(calls, monkeypatch, caplog):
    monkeypatch.delattr(mic_module.sd, "_terminate")
    monkeypatch.delattr(mic_module.sd, "_initialize")

    asyncio.run(MicCapture().start())

    assert calls == ["InputStream"]
    assert "Cannot reload PortAudio" in caplog.text

"""Speak endpoints, events and the Speak my speech hook, with fake engines and player."""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from just_transcribe import server
from just_transcribe.config import AppConfig
from just_transcribe.pipeline.asr import TranscriptSegment
from just_transcribe.pipeline.tts import SpeechService

from test_tts import FakeEngine, FakePlayer, FakeTranslator

SYNTH: list = []


@pytest.fixture
def client(monkeypatch):
    SYNTH.clear()

    class FakeVAD:
        def load_model(self):
            pass

    translator = FakeTranslator()
    monkeypatch.setattr(server, "VoiceActivityDetector", FakeVAD)
    monkeypatch.setattr(server, "RemoteASREngine", lambda **kw: object())
    monkeypatch.setattr(
        server,
        "SpeechService",
        lambda cfg, translator=None, on_event=None: SpeechService(
            cfg, translator=FAKE_TRANSLATOR, on_event=on_event, player=FakePlayer(0.05),
            engine_factory=lambda name, c: FakeEngine(name, SYNTH),
        ),
    )
    cfg = AppConfig(asr_provider="remote", tts_target_lang="en", summary_mode="manual")
    with TestClient(server.create_app(config=cfg)) as c:
        yield c


FAKE_TRANSLATOR = FakeTranslator()


def wait_status(client, ws, uid, final=("done", "error", "stopped"), timeout=3.0):
    seen = []
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        e = json.loads(ws.receive_text())
        if e.get("type") == "speak" and e["id"] == uid:
            seen.append(e["status"])
            if e["status"] in final:
                return seen, e
    raise AssertionError(seen)


def test_speak_status_sequence_and_replay(client):
    with client.websocket_connect("/ws/transcript") as ws:
        uid = client.post("/api/speak", json={"text": "Xin chào", "source_lang": "vi"}).json()["id"]
        seen, last = wait_status(client, ws, uid)
        assert seen == ["queued", "synthesizing", "playing", "done"]
        assert last["text"] == "[en] Xin chào" and last["engine"] == "system"

        rid = client.post("/api/speak/replay", json={"id": uid}).json()["id"]
        seen, _ = wait_status(client, ws, rid)
        assert seen == ["queued", "playing", "done"]
    assert len(SYNTH) == 1


def test_speak_empty_text_and_unknown_replay(client):
    assert client.post("/api/speak", json={"text": "  "}).json()["status"] == "error"
    assert client.post("/api/speak/replay", json={"id": 999999}).json()["status"] == "error"


def test_tts_status_reports_engine_and_languages(client):
    st = client.get("/api/tts/status").json()
    assert st["engine"] == "system" and "en" in st["qwen_languages"] and "vi" not in st["qwen_languages"]
    assert st["qwen_model"] == "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"


def test_speak_my_speech_hook(client):
    state = client.app.state.app_state
    state.config.tts_speak_mic = True
    FAKE_TRANSLATOR.calls.clear()

    def seg(i, source, lang, text):
        return TranscriptSegment(id=i, text=text, source=source, speaker="You" if source == "mic" else "Others",
                                 lang=lang, start=0.0, end=1.0)

    with client.websocket_connect("/ws/transcript") as ws:
        client.portal.call(server._on_segment, state, seg(1, "mic", "vi", "Tôi sẽ gửi bản beta"))
        client.portal.call(server._on_segment, state, seg(2, "speaker", "en", "Others line is not spoken"))
        client.portal.call(server._on_segment, state, seg(3, "mic", "en", "Already English"))
        done = []
        end = time.monotonic() + 3
        while len(done) < 2 and time.monotonic() < end:
            e = json.loads(ws.receive_text())
            if e.get("type") == "speak" and e["status"] == "done":
                done.append(e["text"])
    assert done == ["[en] Tôi sẽ gửi bản beta", "Already English"]
    assert FAKE_TRANSLATOR.calls == [("Tôi sẽ gửi bản beta", "en", "vi")]


def test_speak_my_speech_off_by_default(client):
    state = client.app.state.app_state
    seg = TranscriptSegment(id=1, text="Xin chào", source="mic", speaker="You", lang="vi", start=0.0, end=1.0)
    client.portal.call(server._on_segment, state, seg)
    time.sleep(0.2)
    assert SYNTH == []

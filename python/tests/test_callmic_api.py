"""Call mic API: status, enable through PUT /api/config, restart, TTS reaches the bridge."""

from __future__ import annotations

import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from just_transcribe import config as config_mod
from just_transcribe import server
from just_transcribe.audio import call_mic
from just_transcribe.config import AppConfig
from just_transcribe.pipeline.tts import SpeechService

from test_call_mic import MAC_MIC, SPEAKERS, VIRTUAL, FakeSD, pull, streams
from test_tts import FakePlayer, FakeTranslator


class ToneEngine:
    name = "system"

    def synthesize(self, text, lang):
        return np.full(4800, 0.3, dtype=np.float32), 48000  # 100 ms at 0.3


class FakeASR:
    def set_language(self, lang):
        pass


@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setattr(config_mod, "CONFIG_FILE", tmp_path / "config.toml")
    monkeypatch.setattr(server, "save_config", lambda cfg: config_mod.save_config(cfg, tmp_path / "config.toml"))

    class FakeVAD:
        def load_model(self):
            pass

    sd = FakeSD([MAC_MIC, SPEAKERS])
    monkeypatch.setattr(server, "VoiceActivityDetector", FakeVAD)
    monkeypatch.setattr(server, "RemoteASREngine", lambda **kw: FakeASR())
    monkeypatch.setattr(
        server,
        "SpeechService",
        lambda cfg, translator=None, on_event=None, player=None: SpeechService(
            cfg, translator=FakeTranslator(), on_event=on_event, player=FakePlayer(0.05),
            engine_factory=lambda name, c: ToneEngine(),
        ),
    )
    monkeypatch.setattr(
        server, "CallMicBridge", lambda can_reload: call_mic.CallMicBridge(sd_module=sd, can_reload=can_reload, watchdog_s=3600)
    )
    cfg = AppConfig(asr_provider="remote", summary_mode="manual")
    with TestClient(server.create_app(config=cfg)) as c:
        yield c, sd


def put_config(client, **changes):
    cfg = client.get("/api/config").json()
    cfg.update(changes)
    assert client.put("/api/config", json=cfg).json()["status"] == "ok"


def test_off_by_default(setup):
    client, sd = setup
    assert client.get("/api/callmic/status").json()["state"] == "off"
    assert sd.opened == []


def test_no_device_then_install_then_restart(setup):
    client, sd = setup
    put_config(client, call_mic_enabled=True, call_mic_mode="translation_only")
    assert client.get("/api/callmic/status").json()["state"] == "no_device"

    sd.after_reload = [MAC_MIC, SPEAKERS, VIRTUAL]  # the user installs the driver
    status = client.post("/api/callmic/restart").json()
    assert status == {"state": "running", "mode": "translation_only", "device": call_mic.DEVICE_NAME, "error": ""}
    assert client.get("/api/config").json()["call_mic_enabled"] is True


def test_enable_speak_and_disable(setup):
    client, sd = setup
    sd.devices = [MAC_MIC, SPEAKERS, VIRTUAL]
    put_config(client, call_mic_enabled=True, call_mic_mode="translation_only")
    assert client.get("/api/callmic/status").json()["state"] == "running"
    (out,) = streams(sd, "out")

    assert client.post("/api/speak", json={"text": "hello", "translate": False}).status_code == 200
    heard = []
    end = time.monotonic() + 2
    while time.monotonic() < end and sum(np.isclose(heard, 0.3)) < 4800:
        heard.extend(pull(out)[:, 0])
        time.sleep(0.002)
    assert sum(np.isclose(heard, 0.3)) == 4800  # every TTS sample reached the call side

    put_config(client, call_mic_enabled=False)
    assert client.get("/api/callmic/status").json()["state"] == "off"
    assert streams(sd, "out") == []



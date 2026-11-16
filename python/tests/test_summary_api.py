"""Summary endpoints and WebSocket events, with a fake LLM transport."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from just_transcribe import server
from just_transcribe.config import AppConfig
from just_transcribe.pipeline.summarize import SummaryService

from test_summarize import GOOD, FakeLLM, seg


@pytest.fixture
def llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(monkeypatch, llm):
    class FakeVAD:
        def load_model(self):
            pass

    monkeypatch.setattr(server, "VoiceActivityDetector", FakeVAD)
    monkeypatch.setattr(server, "RemoteASREngine", lambda **kw: object())
    monkeypatch.setattr(
        server, "SummaryService", lambda *a, **kw: SummaryService(*a, client_factory=llm.client, **kw)
    )
    cfg = AppConfig(asr_provider="remote", llm_api_base="https://llm.example", llm_model="m1", summary_mode="manual")
    app = server.create_app(config=cfg)
    with TestClient(app) as c:
        yield c


def test_summary_idle_then_run_then_clear(client, llm):
    state = client.app.state.app_state
    assert client.get("/api/summary").json()["status"] == "idle"

    assert client.put("/api/summary/context", json={"text": "Agenda: beta"}).json() == {"status": "ok", "length": 12}
    state.transcript.extend([seg(1, 0, "Can we ship Friday?", "You", {"vi": "Thứ Sáu?"}), seg(2, 5, "QA needs two days")])

    with client.websocket_connect("/ws/transcript") as ws:
        res = client.post("/api/summary/run").json()
        events = [json.loads(ws.receive_text()), json.loads(ws.receive_text())]

    assert res["status"] == "ok" and res["summary"]["summary"] == GOOD["summary"]
    assert [(e["type"], e["status"]) for e in events] == [("summary", "running"), ("summary", "ok")]
    user_msg = llm.user_msg()
    assert "Agenda: beta" in user_msg and "You: Can we ship Friday?" in user_msg and "Thứ Sáu" not in user_msg

    got = client.get("/api/summary").json()
    assert got["covered_segment_id"] == 2 and got["context"] == "Agenda: beta"

    client.post("/api/transcript/clear")
    got = client.get("/api/summary").json()
    assert got["status"] == "idle" and got["summary"] is None and got["context"] == "Agenda: beta"

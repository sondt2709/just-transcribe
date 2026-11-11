"""Live summary: sliding-window input, prompt build, lenient parse, scheduling."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from just_transcribe.config import AppConfig
from just_transcribe.pipeline.summarize import (
    DEFAULT_TEMPLATE,
    SummaryService,
    build_content,
    merge_summary,
    overlap_for,
    parse_summary,
    render_prompt,
    split_windows,
)

T0 = 1_760_000_000.0  # fixed epoch for wall_start

GOOD = {
    "summary": "Beta ships Friday.",
    "items": [
        {"type": "info", "speaker": "Others", "text": "QA needs two days"},
        {"type": "question", "speaker": "Them", "text": "Who owns release notes?"},
        {"type": "action", "speaker": "You", "text": "Write release notes"},
        {"type": "decision", "speaker": "You", "text": "dropped"},
    ],
    "next_actions": ["Send bug list"],
    "suggested_answers": [{"for": "SSO?", "answer": "Not in the beta."}],
}


def seg(i: int, t: float, text: str = "", speaker: str = "Others", tr: dict | None = None) -> dict:
    return {
        "id": i,
        "text": text or f"line {i}",
        "speaker": speaker,
        "lang": "en",
        "wall_start": T0 + t,
        "translations": tr or {},
    }


def cfg(**kw) -> AppConfig:
    base = dict(llm_api_base="https://llm.example", llm_model="m1", preferred_language="vi")
    base.update(kw)
    return AppConfig(**base)


class FakeLLM:
    """httpx MockTransport that records requests and returns queued replies."""

    def __init__(self, replies: list[str] | None = None, delay: float = 0.0):
        self.replies = list(replies or [])
        self.requests: list[dict] = []
        self.delay = delay
        self.active = 0
        self.max_active = 0

    async def handler(self, request: httpx.Request) -> httpx.Response:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            body = json.loads(request.content)
            self.requests.append({"url": str(request.url), "body": body})
            if self.delay:
                await asyncio.sleep(self.delay)
            reply = self.replies.pop(0) if self.replies else json.dumps(GOOD)
            return httpx.Response(200, json={"choices": [{"message": {"content": reply}}]})
        finally:
            self.active -= 1

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))

    def user_msg(self, i: int = -1) -> str:
        return self.requests[i]["body"]["messages"][1]["content"]


def make_service(transcript: list[dict], llm: FakeLLM, **kw) -> tuple[SummaryService, list[dict]]:
    updates: list[dict] = []
    svc = SummaryService(cfg(**kw), lambda: transcript, updates.append, client_factory=llm.client)
    return svc, updates


# --- pure helpers ---


def test_split_windows_by_span():
    entries = [seg(1, 0), seg(2, 300), seg(3, 600), seg(4, 601), seg(5, 1300)]
    chunks = split_windows(entries, 600)
    assert [[e["id"] for e in c] for c in chunks] == [[1, 2, 3], [4], [5]]


def test_overlap_only_covered_entries_in_range():
    entries = [seg(1, 0), seg(2, 100), seg(3, 150), seg(4, 200)]
    ov = overlap_for(entries, covered_id=3, first_new=entries[3], overlap_s=100)
    assert [e["id"] for e in ov] == [2, 3]
    assert overlap_for(entries, None, entries[3], 60) == []


def test_content_excludes_translations_and_maps_speaker():
    content = build_content(None, [], [seg(1, 0, "Hello", "You", {"vi": "Xin chào"}), seg(2, 1, "Hi", "Others")])
    assert "You: Hello" in content and "Others: Hi" in content
    assert "Xin chào" not in content
    assert "Summary so far" not in content


def test_rolling_content_has_three_parts():
    content = build_content(GOOD | {"items": []}, [seg(1, 0, "old")], [seg(2, 10, "new")])
    assert content.index("Summary so far:") < content.index("Earlier conversation") < content.index("New conversation:")
    assert "Beta ships Friday." in content and "old" in content and "new" in content


def test_rolling_content_sends_summary_and_recent_items_only():
    content = build_content(merge_summary(None, parse_summary(json.dumps(GOOD))), [], [seg(2, 10, "new")])
    for text in ("Beta ships Friday.", "QA needs two days", "Who owns release notes?", "Write release notes"):
        assert text in content
    # next actions and suggested answers are made new on each run, so they are not sent
    assert "Send bug list" not in content and "Not in the beta." not in content


def _item(text, t="info", who="Others"):
    return {"type": t, "speaker": who, "text": text}


def test_merge_keeps_earlier_items_and_appends_new():
    prev = {"summary": "s1", "items": [_item("a"), _item("b")], "next_actions": ["old"], "suggested_answers": []}
    out = merge_summary(prev, {"summary": "s2", "items": [_item("c")], "next_actions": [], "suggested_answers": []})
    assert [i["text"] for i in out["items"]] == ["a", "b", "c"]
    assert out["summary"] == "s2"


def test_merge_update_last_item_replaces_only_the_last():
    prev = {"summary": "s", "items": [_item("a"), _item("b")], "next_actions": [], "suggested_answers": []}
    out = merge_summary(prev, {"summary": "s", "items": [], "update_last_item": _item("b, plus detail"),
                               "next_actions": [], "suggested_answers": []})
    assert [i["text"] for i in out["items"]] == ["a", "b, plus detail"]


def test_merge_drops_repeated_items():
    prev = {"summary": "s", "items": [_item("Ship Friday")], "next_actions": [], "suggested_answers": []}
    out = merge_summary(prev, {"summary": "s", "items": [_item("ship friday"), _item("new")],
                               "next_actions": [], "suggested_answers": []})
    assert [i["text"] for i in out["items"]] == ["Ship Friday", "new"]


def test_merge_replaces_next_actions_and_answers_with_latest():
    prev = {"summary": "s", "items": [], "next_actions": ["old action"],
            "suggested_answers": [{"for": "q1", "answer": "old answer"}]}
    out = merge_summary(prev, {"summary": "s", "items": [], "next_actions": ["new action"],
                               "suggested_answers": [{"for": "q2", "answer": "new answer"}]})
    assert out["next_actions"] == ["new action"]
    assert out["suggested_answers"] == [{"for": "q2", "answer": "new answer"}]


def test_merge_latest_empty_actions_clear_old_ones():
    prev = {"summary": "s", "items": [], "next_actions": ["old"], "suggested_answers": [{"for": "", "answer": "x"}]}
    out = merge_summary(prev, {"summary": "s", "items": [], "next_actions": [], "suggested_answers": []})
    assert out["next_actions"] == [] and out["suggested_answers"] == []


def test_render_prompt_placeholders():
    out = render_prompt("Lang {{language}}. Ctx {{context}}. Content: {{content}}", "C", "Sprint review", "Vietnamese")
    assert out == "Lang Vietnamese. Ctx Sprint review. Content: C"


def test_render_prompt_appends_content_when_missing():
    assert render_prompt("Summarize briefly.", "C", "", "English") == "Summarize briefly.\n\nC"


def test_render_prompt_empty_uses_default():
    out = render_prompt("", "C", "ctx", "English")
    assert out == DEFAULT_TEMPLATE.replace("{{context}}", "ctx").replace("{{language}}", "English").replace("{{content}}", "C")


def test_parse_code_fence_and_normalize():
    s = parse_summary("Here:\n```json\n" + json.dumps(GOOD) + "\n```")
    assert s["summary"] == "Beta ships Friday."
    assert [i["type"] for i in s["items"]] == ["info", "question", "action"]  # "decision" dropped
    assert [i["speaker"] for i in s["items"]] == ["Others", "Others", "You"]  # "Them" -> Others
    assert s["suggested_answers"] == [{"for": "SSO?", "answer": "Not in the beta."}]


def test_parse_invalid_reply():
    with pytest.raises(ValueError):
        parse_summary("Sorry, I cannot help")


def test_config_defaults_for_old_file():
    c = AppConfig.from_dict({"preferred_language": "vi"})
    assert (c.summary_mode, c.summary_debounce_s, c.summary_min_segments) == ("auto", 10.0, 2)
    assert c.summary_max_wait_s == 60.0
    assert (c.summary_window_s, c.summary_overlap_s, c.summary_prompt) == (600.0, 60.0, "")
    c2 = AppConfig.from_dict(cfg(summary_mode="manual", summary_prompt="X").to_dict())
    assert (c2.summary_mode, c2.summary_prompt) == ("manual", "X")
    assert "context" not in " ".join(c2.to_dict().keys())


# --- service ---


def test_run_uses_translation_llm_settings():
    llm = FakeLLM()
    svc, updates = make_service([seg(1, 0), seg(2, 5)], llm)
    snap = asyncio.run(svc.run_now())
    assert llm.requests[0]["url"] == "https://llm.example/v1/chat/completions"
    assert llm.requests[0]["body"]["model"] == "m1"
    assert "Vietnamese" in llm.requests[0]["body"]["messages"][0]["content"]
    assert snap["status"] == "ok" and snap["covered_segment_id"] == 2
    assert [u["status"] for u in updates] == ["running", "ok"]


def test_not_configured():
    llm = FakeLLM()
    svc, _ = make_service([seg(1, 0)], llm, llm_model="")
    snap = asyncio.run(svc.run_now())
    assert snap["status"] == "error" and snap["error"] == "LLM not configured"
    assert llm.requests == []


def test_invalid_reply_keeps_previous_summary():
    transcript = [seg(1, 0)]
    llm = FakeLLM([json.dumps(GOOD), "Sorry, I cannot help"])
    svc, _ = make_service(transcript, llm)
    asyncio.run(svc.run_now())
    transcript.append(seg(2, 10))
    snap = asyncio.run(svc.run_now())
    assert snap["status"] == "error"
    assert snap["summary"]["summary"] == "Beta ships Friday."
    assert snap["covered_segment_id"] == 1


def test_rolling_run_keeps_items_the_llm_did_not_repeat():
    transcript = [seg(1, 0)]
    second = {"summary": "Beta ships Friday; SSO later.", "update_last_item": None,
              "items": [{"type": "info", "speaker": "Others", "text": "SSO comes in v2"}],
              "next_actions": ["Tell the client about v2"], "suggested_answers": []}
    llm = FakeLLM([json.dumps(GOOD), json.dumps(second)])
    svc, _ = make_service(transcript, llm)
    asyncio.run(svc.run_now())
    transcript.append(seg(2, 10))
    snap = asyncio.run(svc.run_now())
    texts = [i["text"] for i in snap["summary"]["items"]]
    assert texts == ["QA needs two days", "Who owns release notes?", "Write release notes", "SSO comes in v2"]
    assert snap["summary"]["next_actions"] == ["Tell the client about v2"]
    assert snap["summary"]["suggested_answers"] == []
    assert "update_last_item" not in snap["summary"]


def test_short_transcript_sent_in_full():
    transcript = [seg(i, i * 20) for i in range(1, 13)]  # 4 minutes
    llm = FakeLLM()
    svc, _ = make_service(transcript, llm)
    asyncio.run(svc.run_now())
    assert len(llm.requests) == 1
    msg = llm.user_msg()
    assert all(f"line {i}" in msg for i in range(1, 13))
    assert "Summary so far" not in msg


def test_rolling_update_with_overlap():
    transcript = [seg(i, i * 30) for i in range(1, 11)]  # ids 1..10, t=30..300
    llm = FakeLLM()
    svc, _ = make_service(transcript, llm, summary_overlap_s=60)
    asyncio.run(svc.run_now())
    transcript.extend(seg(i, i * 30) for i in range(11, 16))  # 5 new, first at t=330
    asyncio.run(svc.run_now())
    msg = llm.user_msg()
    assert "Summary so far:" in msg
    # overlap = covered entries with t >= 270 -> ids 9, 10
    assert "line 9\n" in msg and "line 10\n" in msg
    assert "line 8\n" not in msg
    assert all(f"line {i}" in msg for i in range(11, 16))


def test_long_backlog_in_windows():
    transcript = [seg(i, i * 60) for i in range(0, 25)]  # 0..24 min
    llm = FakeLLM()
    svc, _ = make_service(transcript, llm, summary_window_s=600)
    snap = asyncio.run(svc.run_now())
    assert len(llm.requests) == 3
    assert "Summary so far" not in llm.user_msg(0)
    assert "Summary so far" in llm.user_msg(1) and "Summary so far" in llm.user_msg(2)
    assert snap["covered_segment_id"] == 24


def test_context_in_prompt_and_capped():
    llm = FakeLLM()
    svc, _ = make_service([seg(1, 0)], llm)
    svc.set_context("Agenda: sprint review")
    asyncio.run(svc.run_now())
    assert "Agenda: sprint review" in llm.user_msg()
    assert len(svc.set_context("x" * 30_000)) == 20_000


def test_reset_clears_summary_keeps_context():
    llm = FakeLLM()
    svc, updates = make_service([seg(1, 0)], llm)
    svc.set_context("ctx")
    asyncio.run(svc.run_now())
    svc.reset()
    assert svc.snapshot()["status"] == "idle" and svc.snapshot()["summary"] is None
    assert svc.context == "ctx"
    assert updates[-1]["status"] == "idle"


# --- auto scheduling ---


async def _auto_scenario(arrivals: list[float], wait: float, **kw) -> FakeLLM:
    transcript: list[dict] = []
    llm = FakeLLM()
    svc, _ = make_service(transcript, llm, **kw)
    t = 0.0
    for i, at in enumerate(arrivals, start=1):
        await asyncio.sleep(at - t)
        t = at
        transcript.append(seg(i, at))
        svc.notify_segment()
    await asyncio.sleep(wait)
    await svc.close()
    return llm


def test_auto_runs_after_debounce():
    llm = asyncio.run(_auto_scenario([0, 0.1, 0.2], wait=1.3, summary_debounce_s=1.0, summary_min_segments=2))
    assert len(llm.requests) == 1


def test_debounce_restarts_on_new_segment():
    # segment every 0.6 s with a 1 s debounce: no run while speech continues
    llm = asyncio.run(_auto_scenario([0, 0.6, 1.2, 1.8], wait=0.5, summary_debounce_s=1.0, summary_min_segments=1))
    assert llm.requests == []


def test_max_wait_runs_while_people_keep_talking():
    # segment every 0.6 s never lets the 1 s debounce fire; the 1.5 s max wait does
    llm = asyncio.run(_auto_scenario([0, 0.6, 1.2, 1.8, 2.4], wait=0.3, summary_debounce_s=1.0,
                                     summary_max_wait_s=1.5, summary_min_segments=1))
    assert len(llm.requests) == 1
    assert "line 3" in llm.user_msg(0) and "line 4" not in llm.user_msg(0)


def test_max_wait_zero_is_off():
    llm = asyncio.run(_auto_scenario([0, 0.6, 1.2, 1.8, 2.4], wait=0.3, summary_debounce_s=1.0,
                                     summary_max_wait_s=0, summary_min_segments=1))
    assert llm.requests == []


def test_min_segments_not_reached():
    llm = asyncio.run(_auto_scenario([0], wait=1.3, summary_debounce_s=1.0, summary_min_segments=2))
    assert llm.requests == []


def test_manual_mode_never_auto_runs():
    llm = asyncio.run(_auto_scenario([0, 0.1, 0.2], wait=1.3, summary_mode="manual", summary_debounce_s=1.0))
    assert llm.requests == []


def test_trigger_during_run_queues_one_rerun_never_parallel():
    async def scenario() -> FakeLLM:
        transcript = [seg(1, 0)]
        llm = FakeLLM(delay=0.3)
        svc, _ = make_service(transcript, llm)
        svc.trigger()
        await asyncio.sleep(0.05)
        transcript.append(seg(2, 5))
        svc.trigger()
        svc.trigger()
        await asyncio.sleep(1.0)
        return llm

    llm = asyncio.run(scenario())
    assert len(llm.requests) == 2
    assert llm.max_active == 1

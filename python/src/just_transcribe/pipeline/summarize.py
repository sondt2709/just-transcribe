"""Live conversation summary via the translation LLM (OpenAI-compatible chat API).

Input is the original transcript text only (no translations). Long transcripts are
summarized with a sliding window: previous summary + overlap of already-summarized
segments + new segments, at most `window_s` seconds of new transcript per LLM call.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Callable, Optional

import httpx

from just_transcribe.config import AppConfig
from just_transcribe.pipeline.translate import LANG_NAMES
from just_transcribe.tracing import NullTracer

logger = logging.getLogger(__name__)

CONTEXT_MAX_CHARS = 20_000
ITEM_TYPES = ("info", "action", "question")

DEFAULT_TEMPLATE = """Summarize the following conversation for me.

Context about this conversation (may be empty):
{{context}}

Write in {{language}}.

Content:
{{content}}"""

SYSTEM_PROMPT = """You summarize a live conversation for the user of a transcription app.
In the transcript, "You" is the user and "Others" is the other party (one or more people).
Write all text values in {language}.
Return ONLY a JSON object, no Markdown and no other text, with this exact shape:
{{
  "summary": "overall summary of the whole conversation so far",
  "update_last_item": null,
  "items": [{{"type": "info" | "action" | "question", "speaker": "You" | "Others", "text": "..."}}],
  "next_actions": ["what the user should do next"],
  "suggested_answers": [{{"for": "the question or action to answer", "answer": "a reply the user can say"}}]
}}
"info" is a fact or decision, "action" is a task or commitment, "question" is a question that was asked.
"items" lists only the NEW items of the new conversation. Never repeat an item from "Recent items".
If the new conversation continues the LAST item of "Recent items" (the same point with more detail or a change),
set "update_last_item" to the complete updated item (same shape as an item) instead of adding a new item.
Otherwise set "update_last_item" to null.
"next_actions" and "suggested_answers" are only about the latest part of the conversation: what the user
should do and say now. Do not keep older ones.
Suggested answers are replies the user ("You") can give to open questions or requests from "Others".
When a "Summary so far" is given, "summary" covers the WHOLE conversation, not only the new part."""

RECENT_ITEMS = 8  # earlier items shown to the LLM so it can avoid duplicates and extend the last one

TypedTranscript = list[dict]


def language_name(code: str) -> str:
    return LANG_NAMES.get(code, code or "English")


def format_line(entry: dict) -> str:
    """`[HH:MM:SS] You: text` — original text only, local wall-clock time."""
    ts = datetime.fromtimestamp(entry.get("wall_start") or 0).strftime("%H:%M:%S")
    speaker = "You" if entry.get("speaker") == "You" else "Others"
    return f"[{ts}] {speaker}: {entry.get('text', '')}"


def split_windows(entries: TypedTranscript, window_s: float) -> list[TypedTranscript]:
    """Split entries into sequential chunks, each spanning at most `window_s` seconds."""
    chunks: list[TypedTranscript] = []
    for e in entries:
        if chunks and (e.get("wall_start", 0) - chunks[-1][0].get("wall_start", 0)) <= window_s:
            chunks[-1].append(e)
        else:
            chunks.append([e])
    return chunks


def overlap_for(entries: TypedTranscript, covered_id: Optional[int], first_new: dict, overlap_s: float) -> TypedTranscript:
    """Already-summarized entries in the `overlap_s` seconds before the first new entry."""
    if covered_id is None or overlap_s <= 0:
        return []
    start = first_new.get("wall_start", 0) - overlap_s
    return [e for e in entries if e["id"] <= covered_id and e.get("wall_start", 0) >= start]


def format_item(item: dict) -> str:
    return f"- [{item.get('type', 'info')}] {item.get('speaker', 'Others')}: {item.get('text', '')}"


def summary_to_text(summary: dict) -> str:
    """The previous summary for a rolling update: the overall summary and the recent items.
    Next actions and suggested answers are not sent: each run makes new ones."""
    parts = [summary.get("summary") or "-"]
    recent = (summary.get("items") or [])[-RECENT_ITEMS:]
    if recent:
        parts.append("Recent items (oldest first; only the last one can be updated):")
        parts.extend(format_item(it) for it in recent)
    return "\n".join(parts)


def build_content(prev_summary: Optional[dict], overlap: TypedTranscript, new: TypedTranscript) -> str:
    new_text = "\n".join(format_line(e) for e in new)
    if prev_summary is None:
        return new_text
    parts = [f"Summary so far:\n{summary_to_text(prev_summary)}"]
    if overlap:
        parts.append("Earlier conversation (already summarized):\n" + "\n".join(format_line(e) for e in overlap))
    parts.append(f"New conversation:\n{new_text}")
    return "\n\n".join(parts)


def render_prompt(template: str, content: str, context: str, language: str) -> str:
    tpl = template.strip() or DEFAULT_TEMPLATE
    has_content = "{{content}}" in tpl
    out = tpl.replace("{{context}}", context).replace("{{language}}", language)
    if has_content:
        return out.replace("{{content}}", content)
    return f"{out}\n\n{content}"


def parse_summary(reply: str) -> dict:
    """Lenient parse of the LLM reply into the 4-block summary. Raises ValueError."""
    start, end = reply.find("{"), reply.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("LLM reply has no JSON object")
    try:
        data = json.loads(reply[start : end + 1])
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM reply is not valid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("LLM reply is not a JSON object")

    items = [i for i in (_parse_item(it) for it in data.get("items") or []) if i]

    answers = []
    for a in data.get("suggested_answers") or []:
        if isinstance(a, dict) and a.get("answer"):
            answers.append({"for": str(a.get("for", "")).strip(), "answer": str(a["answer"]).strip()})
        elif isinstance(a, str) and a.strip():
            answers.append({"for": "", "answer": a.strip()})

    return {
        "summary": str(data.get("summary", "")).strip(),
        "items": items,
        "next_actions": [str(a).strip() for a in data.get("next_actions") or [] if str(a).strip()],
        "suggested_answers": answers,
        "update_last_item": _parse_item(data.get("update_last_item")),
    }


def _parse_item(it) -> Optional[dict]:
    if not isinstance(it, dict):
        return None
    t = str(it.get("type", "")).strip().lower()
    if t not in ITEM_TYPES or not it.get("text"):
        return None
    speaker = "You" if str(it.get("speaker", "")).strip().lower() == "you" else "Others"
    return {"type": t, "speaker": speaker, "text": str(it["text"]).strip()}


def merge_summary(prev: Optional[dict], result: dict) -> dict:
    """Apply one LLM result to the previous summary. Earlier items are kept by the code, not
    the LLM: the LLM can only replace the last item or append new ones. Next actions and
    suggested answers are replaced by the latest ones."""
    items = [dict(i) for i in (prev or {}).get("items") or []]
    update = result.get("update_last_item")
    if update:
        if items:
            items[-1] = update
        else:
            items.append(update)
    seen = {i["text"].casefold() for i in items}
    for it in result.get("items") or []:
        if it["text"].casefold() not in seen:
            items.append(it)
            seen.add(it["text"].casefold())
    return {
        "summary": result.get("summary") or (prev or {}).get("summary", ""),
        "items": items,
        "next_actions": list(result.get("next_actions") or []),
        "suggested_answers": list(result.get("suggested_answers") or []),
    }


class SummaryService:
    """Owns the live summary: scheduling, sliding-window prompts, LLM calls and state."""

    def __init__(
        self,
        config: AppConfig,
        get_transcript: Callable[[], TypedTranscript],
        on_update: Optional[Callable[[dict], None]] = None,
        client_factory: Optional[Callable[[], httpx.AsyncClient]] = None,
    ):
        self._get_transcript = get_transcript
        self._on_update = on_update
        self._client_factory = client_factory or (lambda: httpx.AsyncClient(timeout=90.0))
        self._client: Optional[httpx.AsyncClient] = None
        self._tracer = NullTracer()

        self.context = ""
        self.summary: Optional[dict] = None
        self.covered_id: Optional[int] = None
        self.status = "idle"
        self.error = ""
        self.updated_at: Optional[float] = None

        self._timer: Optional[asyncio.TimerHandle] = None  # debounce: silence after the last segment
        self._max_timer: Optional[asyncio.TimerHandle] = None  # max wait while people keep talking
        self._running = False
        self._pending = False
        self._generation = 0  # bumped by reset(); stale runs drop their result
        self.configure(config)

    # --- configuration ---

    def configure(self, cfg: AppConfig) -> None:
        if (cfg.llm_api_base.rstrip("/"), cfg.llm_api_key) != (
            getattr(self, "api_base", None), getattr(self, "api_key", None)
        ):
            self._client = None
        self.api_base = cfg.llm_api_base.rstrip("/")
        self.model = cfg.llm_model
        self.api_key = cfg.llm_api_key
        self.language = language_name(cfg.preferred_language)
        self.mode = cfg.summary_mode
        self.debounce_s = max(1.0, float(cfg.summary_debounce_s))
        # 0 disables the max wait; otherwise never shorter than the debounce
        self.max_wait_s = float(cfg.summary_max_wait_s)
        if self.max_wait_s > 0:
            self.max_wait_s = max(self.debounce_s, self.max_wait_s)
        self.min_segments = max(1, int(cfg.summary_min_segments))
        self.window_s = max(60.0, float(cfg.summary_window_s))
        self.overlap_s = max(0.0, float(cfg.summary_overlap_s))
        self.template = cfg.summary_prompt
        if self.mode != "auto":
            self._cancel_timer()

    def set_tracer(self, tracer) -> None:
        self._tracer = tracer or NullTracer()

    @property
    def is_configured(self) -> bool:
        return bool(self.api_base and self.model)

    def set_context(self, text: str) -> str:
        self.context = (text or "")[:CONTEXT_MAX_CHARS]
        return self.context

    # --- state ---

    def snapshot(self) -> dict:
        return {
            "status": self.status,
            "summary": self.summary,
            "updated_at": self.updated_at,
            "error": self.error,
            "covered_segment_id": self.covered_id,
        }

    def _emit(self) -> None:
        if self._on_update:
            self._on_update(self.snapshot())

    def _new_entries(self) -> TypedTranscript:
        entries = self._get_transcript()
        if self.covered_id is None:
            return list(entries)
        return [e for e in entries if e["id"] > self.covered_id]

    def reset(self) -> None:
        """Forget the summary (transcript cleared). The session context is kept."""
        self._cancel_timer()
        self._generation += 1
        self._pending = False
        self.summary = None
        self.covered_id = None
        self.status = "idle"
        self.error = ""
        self.updated_at = None
        self._emit()

    # --- triggers ---

    def notify_segment(self) -> None:
        """Called for every final segment. Restarts the debounce timer (run after a pause) and
        starts the max-wait timer if it is not running (run while people keep talking)."""
        if self.mode != "auto" or not self.is_configured:
            return
        loop = asyncio.get_running_loop()
        if self._timer is not None:
            self._timer.cancel()
        self._timer = loop.call_later(self.debounce_s, self._on_debounce)
        if self._max_timer is None and self.max_wait_s > 0:
            self._max_timer = loop.call_later(self.max_wait_s, self._on_max_wait)

    def _cancel_timer(self) -> None:
        for t in (self._timer, self._max_timer):
            if t is not None:
                t.cancel()
        self._timer = self._max_timer = None

    def _on_debounce(self) -> None:
        self._timer = None
        self._maybe_trigger()

    def _on_max_wait(self) -> None:
        self._max_timer = None
        self._maybe_trigger()

    def _maybe_trigger(self) -> None:
        if len(self._new_entries()) >= self.min_segments:
            self._cancel_timer()
            self.trigger()

    def trigger(self) -> None:
        """Start a run now, or queue exactly one rerun if a run is in progress."""
        if self._running:
            self._pending = True
            return
        self._running = True
        asyncio.get_running_loop().create_task(self._run_loop())

    async def run_now(self) -> dict:
        """Manual run. Waits for the result and returns the snapshot."""
        if self._running:
            self._pending = True
            while self._running:
                await asyncio.sleep(0.05)
            return self.snapshot()
        self._running = True
        await self._run_loop()
        return self.snapshot()

    async def _run_loop(self) -> None:
        try:
            while True:
                self._pending = False
                await self._run_once()
                if not self._pending:
                    break
        finally:
            self._running = False

    # --- one run (may be several LLM calls for a backlog) ---

    async def _run_once(self) -> None:
        if not self.is_configured:
            self.status, self.error = "error", "LLM not configured"
            self._emit()
            return
        new = self._new_entries()
        if not new:
            if self.status == "running":
                self.status = "ok" if self.summary else "idle"
            self._emit()
            return

        generation = self._generation
        self.status, self.error = "running", ""
        self._emit()

        entries = self._get_transcript()
        prev = self.summary
        covered = self.covered_id
        chunks = split_windows(new, self.window_s)
        try:
            for i, chunk in enumerate(chunks):
                overlap = overlap_for(entries, covered, chunk[0], self.overlap_s) if prev else []
                content = build_content(prev, overlap, chunk)
                result = await self._call_llm(content, chunk_index=i, chunk_count=len(chunks))
                if generation != self._generation:
                    return  # transcript was cleared during the call
                prev, covered = merge_summary(prev, result), chunk[-1]["id"]
                self.summary, self.covered_id = prev, covered
            self.status = "ok"
            self.updated_at = time.time()
        except Exception as e:
            if generation != self._generation:
                return
            logger.warning("Summary failed: %s", e)
            # Chunks that succeeded before the failure stay applied.
            self.status, self.error = "error", str(e) or e.__class__.__name__
        self._emit()

    async def _call_llm(self, content: str, chunk_index: int = 0, chunk_count: int = 1) -> dict:
        user_msg = render_prompt(self.template, content, self.context, self.language)
        system_msg = SYSTEM_PROMPT.format(language=self.language)
        fields = {
            "model": self.model,
            "chunk": chunk_index,
            "chunks": chunk_count,
            "prompt_chars": len(user_msg) + len(system_msg),
        }
        if self._tracer.debug_audio:
            fields["prompt"] = user_msg
        self._tracer.trace("summary_call", **fields)
        t0 = time.monotonic()
        try:
            if self._client is None:
                self._client = self._client_factory()
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            resp = await self._client.post(
                f"{self.api_base}/v1/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 2048,
                },
            )
            resp.raise_for_status()
            reply = resp.json()["choices"][0]["message"]["content"] or ""
            result = parse_summary(reply)
        except Exception as e:
            self._tracer.trace(
                "summary_done", latency_s=round(time.monotonic() - t0, 3), status="error", error=str(e)
            )
            raise
        self._tracer.trace(
            "summary_done", latency_s=round(time.monotonic() - t0, 3), status="ok",
            items=len(result["items"]),
        )
        return result

    async def close(self) -> None:
        self._cancel_timer()
        if self._client:
            await self._client.aclose()
            self._client = None

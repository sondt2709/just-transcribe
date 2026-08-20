"""Async translation via OpenAI-compatible LLM API."""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Optional

import httpx

from just_transcribe.pipeline.asr import TranscriptSegment
from just_transcribe.tracing import NullTracer

logger = logging.getLogger(__name__)

# Language code mapping for display
LANG_NAMES = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Chinese",
    "yue": "Cantonese",
    "ja": "Japanese",
    "ko": "Korean",
}


@dataclass
class TranslationResult:
    segment_id: int
    translated_text: str
    target_lang: str


@dataclass
class ContextEntry:
    text: str
    speaker: str
    lang: str
    translations: dict[str, str]


class TranslationService:
    """Translates transcript segments via OpenAI-compatible chat API."""

    def __init__(
        self,
        api_base: str = "",
        model: str = "",
        api_key: str = "",
        preferred_language: str = "en",
        preferred_language_2: str = "",
    ):
        self.api_base = api_base.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.preferred_language = preferred_language
        self.preferred_language_2 = preferred_language_2
        self._context_window: deque[ContextEntry] = deque(maxlen=4)
        self._client: Optional[httpx.AsyncClient] = None
        self._tracer = NullTracer()

    def set_tracer(self, tracer) -> None:
        """Attach a session tracer (or NullTracer when no session is active)."""
        self._tracer = tracer or NullTracer()

    def update_config(
        self,
        api_base: str = "",
        model: str = "",
        api_key: str = "",
        preferred_language: str = "en",
        preferred_language_2: str = "",
    ) -> None:
        self.api_base = api_base.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.preferred_language = preferred_language
        self.preferred_language_2 = preferred_language_2
        # Reset client if config changed
        self._client = None

    @property
    def is_configured(self) -> bool:
        return bool(self.api_base and self.model)

    def get_translation_targets(self, segment: TranscriptSegment) -> list[str]:
        """Return target languages that differ from the segment's detected language."""
        if not self.is_configured:
            return []
        seg_lang = segment.lang.lower().split("-")[0] if segment.lang else ""
        targets = []
        for lang in [self.preferred_language, self.preferred_language_2]:
            if not lang:
                continue
            if lang.lower().split("-")[0] != seg_lang and lang not in targets:
                targets.append(lang)
        return targets

    async def translate_multi(
        self, segment: TranscriptSegment, trace_id: str = ""
    ) -> list[TranslationResult]:
        """Translate a segment to all applicable targets. Returns results (may be partial on failure)."""
        targets = self.get_translation_targets(segment)
        if not targets:
            return []

        entry = ContextEntry(
            text=segment.text,
            speaker=segment.speaker,
            lang=(segment.lang or "").lower().split("-")[0],
            translations={},
        )
        self._context_window.append(entry)

        import asyncio
        results = await asyncio.gather(
            *(self._translate_to(segment, lang, trace_id) for lang in targets),
            return_exceptions=True,
        )

        valid_results = []
        for r in results:
            if isinstance(r, TranslationResult):
                entry.translations[r.target_lang] = r.translated_text
                valid_results.append(r)
        return valid_results

    async def _translate_to(
        self, segment: TranscriptSegment, target_lang: str, trace_id: str = ""
    ) -> Optional[TranslationResult]:
        """Translate a segment to a specific language. Returns None on failure."""
        target_name = LANG_NAMES.get(target_lang, target_lang)
        source_lang = (segment.lang or "").lower().split("-")[0]
        source_name = LANG_NAMES.get(source_lang, source_lang)

        context_lines = []
        for prev in list(self._context_window)[:-1]:
            prev_source_name = LANG_NAMES.get(prev.lang, prev.lang)
            context_lines.append(f"[{prev.speaker}] {prev_source_name}: {prev.text}")
            if target_lang in prev.translations:
                context_lines.append(f"[{prev.speaker}] {target_name}: {prev.translations[target_lang]}")
            context_lines.append("")

        context = "\n".join(context_lines).strip()
        prompt = f"You are a professional translator. Translate from {source_name} to {target_name}. Output ONLY the translation, nothing else."
        if context:
            prompt += f"\n\nPrevious exchanges:\n{context}\n\nTranslate:"

        logger.debug("Translation prompt for segment %d to %s:\n%s", segment.id, target_lang, prompt)

        call_fields = {
            "trace_id": trace_id,
            "segment_id": segment.id,
            "target_lang": target_lang,
            "model": self.model,
            "context_entries": len(context_lines),
            "prompt_chars": len(prompt),
        }
        # Full prompt persisted only in debug mode (it duplicates transcript content)
        if self._tracer.debug_audio:
            call_fields["prompt"] = prompt
        self._tracer.trace("translate_call", **call_fields)
        t0 = time.monotonic()

        try:
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=10.0)

            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            response = await self._client.post(
                f"{self.api_base}/v1/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": segment.text},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 512,
                },
            )
            response.raise_for_status()
            data = response.json()
            translated = data["choices"][0]["message"]["content"].strip()

            self._tracer.trace(
                "translate_done", trace_id=trace_id, segment_id=segment.id,
                target_lang=target_lang, latency_s=round(time.monotonic() - t0, 3),
                status="ok", text=translated,
            )
            return TranslationResult(
                segment_id=segment.id,
                translated_text=translated,
                target_lang=target_lang,
            )
        except Exception as e:
            self._tracer.trace(
                "translate_done", trace_id=trace_id, segment_id=segment.id,
                target_lang=target_lang, latency_s=round(time.monotonic() - t0, 3),
                status="error", error=str(e),
            )
            logger.warning("Translation to %s failed for segment %d: %s", target_lang, segment.id, e)
            return None

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

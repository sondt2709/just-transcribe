"""Remote ASR engine — transcribes audio via OpenAI-compatible HTTP API."""

from __future__ import annotations

import io
import logging
import time
from typing import Any, Optional

import httpx
import numpy as np
import soundfile as sf

from just_transcribe.pipeline.asr import TranscriptSegment

logger = logging.getLogger(__name__)

# Retry config
_MAX_RETRIES = 1
_BACKOFF_BASE_S = 1.0
_RETRYABLE_STATUS = {429, 500, 502, 503}
_REQUEST_TIMEOUT_S = 30.0


class RemoteASREngine:
    """Transcribes audio by POSTing WAV to an OpenAI-compatible ASR server."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        language: str = "",
    ):
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self._language = language or None  # None = auto-detect
        self._segment_counter = 0

    @property
    def is_loaded(self) -> bool:
        return True

    def set_language(self, language: str) -> None:
        self._language = language or None

    def transcribe_segment(
        self,
        audio: np.ndarray,
        source: str,
        start_time: float,
        end_time: float,
    ) -> Optional[TranscriptSegment]:
        try:
            result = self._post_transcription(audio)
            if result is None:
                return None

            logger.info("Remote ASR response keys=%s language=%s text=%s", list(result.keys()), result.get("language"), result.get("text", "")[:50])

            text = result.get("text", "").strip()
            if not text:
                return None

            self._segment_counter += 1
            speaker = "You" if source == "mic" else "Others"

            return TranscriptSegment(
                id=self._segment_counter,
                text=text,
                source=source,
                speaker=speaker,
                lang=result.get("language", "unknown"),
                start=start_time,
                end=end_time,
            )
        except Exception as e:
            logger.error("Remote ASR transcription failed: %s", e)
            return None

    def _encode_wav(self, audio: np.ndarray) -> io.BytesIO:
        buf = io.BytesIO()
        sf.write(buf, audio, 16000, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return buf

    def _post_transcription(self, audio: np.ndarray) -> Optional[dict[str, Any]]:
        endpoint = f"{self._base_url}/v1/audio/transcriptions"
        wav_buf = self._encode_wav(audio)

        headers = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        data: dict[str, str] = {"model": self._model}
        if self._language:
            data["language"] = self._language

        last_exc: Optional[Exception] = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                wav_buf.seek(0)
                with httpx.Client(timeout=_REQUEST_TIMEOUT_S) as client:
                    resp = client.post(
                        endpoint,
                        files={"file": ("segment.wav", wav_buf, "audio/wav")},
                        data=data,
                        headers=headers,
                    )

                if resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                    delay = _BACKOFF_BASE_S * (2**attempt)
                    logger.warning(
                        "Remote ASR %d, retrying in %.1fs...", resp.status_code, delay
                    )
                    time.sleep(delay)
                    continue

                resp.raise_for_status()
                return resp.json()

            except (httpx.ConnectError, httpx.TimeoutException) as e:
                last_exc = e
                if attempt < _MAX_RETRIES:
                    delay = _BACKOFF_BASE_S * (2**attempt)
                    logger.warning("Remote ASR connection error, retrying in %.1fs...", delay)
                    time.sleep(delay)
                    continue
                raise
            except httpx.HTTPStatusError:
                raise

        if last_exc:
            raise last_exc
        return None


def test_connection(
    url: str, api_key: str = ""
) -> dict[str, Any]:
    """Test connectivity to a remote ASR server. Returns {ok, models?, error?}."""
    try:
        base = url.rstrip("/")
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{base}/v1/models", headers=headers)
            resp.raise_for_status()
            body = resp.json()

        # Support both OpenAI format {"data": [...]} and custom {"models": [...]}
        model_list = body.get("data") or body.get("models") or []
        models = [m["id"] for m in model_list if "id" in m]
        return {"ok": True, "models": models}

    except httpx.ConnectError:
        return {"ok": False, "error": "Connection refused — is the server running?"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Connection timed out"}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def list_models(url: str, api_key: str = "") -> list[str]:
    """Fetch available model IDs from a remote ASR server."""
    result = test_connection(url, api_key)
    if result["ok"]:
        return result.get("models", [])
    return []

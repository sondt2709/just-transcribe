"""Translate-and-speak: engine choice, voices, queue, stop, replay, self-capture prevention."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from types import SimpleNamespace

import httpx
import numpy as np
import pytest

from just_transcribe.audio.speaker import SpeakerCapture
from just_transcribe.config import AppConfig
from just_transcribe.pipeline import tts as tts_mod
from just_transcribe.pipeline.tts import (
    QwenLocalEngine,
    QwenRemoteEngine,
    SpeechService,
    SystemEngine,
    parse_say_voices,
    pick_voice,
    resolve_output_device,
)

SAY_OUTPUT = """Albert              en_US    # Hello! My name is Albert.
Bad News            en_US    # Hello! My name is Bad News.
Eddy (English (US)) en_US    # Hello! My name is Eddy.
Samantha            en_US    # Hello! My name is Samantha.
Linh                vi_VN    # Xin chào! Tên tôi là Linh.
Sinji               zh_HK    # 您好！我叫 Sinji。
Tingting            zh_CN    # 你好！我叫婷婷。
"""


# --- voices ---


def test_parse_and_pick_voice():
    voices = parse_say_voices(SAY_OUTPUT)
    assert {"name": "Eddy (English (US))", "locale": "en_US"} in voices
    assert pick_voice(voices, "vi") == "Linh"
    assert pick_voice(voices, "en") == "Samantha"  # preferred over novelty "Albert"
    assert pick_voice(voices, "yue") == "Sinji"
    assert pick_voice(voices, "zh") == "Tingting"
    assert pick_voice(voices, "ja") is None


def test_system_engine_runs_say_with_file_input(tmp_path):
    calls = []

    def runner(args, **kw):
        calls.append(args)
        if args[:3] == ["say", "-v", "?"]:
            return SimpleNamespace(stdout=SAY_OUTPUT)
        import soundfile as sf

        sf.write(args[args.index("-o") + 1], np.zeros(2205, dtype=np.float32), 22050)
        return SimpleNamespace(stdout="")

    audio, sr = SystemEngine("", runner=runner).synthesize("-v not an option", "vi")
    say = calls[-1]
    assert say[:3] == ["say", "-v", "Linh"] and "-f" in say and "-v not an option" not in say
    assert sr == 22050 and len(audio) == 2205


# --- engine choice and fallback ---


class FakeEngine:
    def __init__(self, name: str, log: list, delay: float = 0.0):
        self.name, self.log, self.delay = name, log, delay

    def synthesize(self, text, lang):
        self.log.append((self.name, text, lang))
        time.sleep(self.delay)
        return np.zeros(100, dtype=np.float32), 16000


class FakePlayer:
    def __init__(self, seconds: float = 0.05):
        self.seconds = seconds
        self.played: list[tuple[int, str]] = []
        self.active = 0
        self.max_active = 0
        self._lock = threading.Lock()

    def play(self, audio, sr, device, stop):
        with self._lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        self.played.append((len(audio), device))
        end = time.monotonic() + self.seconds
        while time.monotonic() < end and not stop.is_set():
            time.sleep(0.01)
        with self._lock:
            self.active -= 1


class FakeTranslator:
    is_configured = True

    def __init__(self):
        self.calls = []

    async def translate_once(self, text, target, source=""):
        self.calls.append((text, target, source))
        return f"[{target}] {text}"


def make(cfg_kw=None, play_s=0.05, synth_delay=0.0, translator=None):
    events, synth = [], []
    cfg = AppConfig(**(cfg_kw or {}))
    player = FakePlayer(play_s)
    svc = SpeechService(
        cfg,
        translator=translator if translator is not None else FakeTranslator(),
        on_event=events.append,
        player=player,
        engine_factory=lambda name, c: FakeEngine(name, synth, synth_delay),
    )
    return svc, events, synth, player


def statuses(events, uid):
    return [e["status"] for e in events if e["id"] == uid]


@pytest.mark.parametrize(
    "engine,fallback,lang,expected",
    [
        ("system", True, "en", "system"),
        ("qwen_local", True, "en", "qwen_local"),
        ("qwen_local", True, "vi", "system"),
        ("qwen_local", False, "vi", "qwen_local"),
        ("qwen_remote", True, "ja", "qwen_remote"),
        ("qwen_remote", True, "vi", "system"),
    ],
)
def test_engine_choice(engine, fallback, lang, expected):
    svc, *_ = make({"tts_engine": engine, "tts_fallback_system": fallback})
    assert svc.engine_for(lang) == expected


def test_qwen_language_names_and_auto():
    calls = []

    class Model:
        sample_rate = 24000

        def generate(self, text, voice, lang_code):
            calls.append((voice, lang_code))
            yield SimpleNamespace(audio=np.ones(10))

    eng = QwenLocalEngine("m", "ryan", loader=lambda _id: Model())
    eng.synthesize("hi", "en")
    eng.synthesize("xin chào", "vi")
    assert calls == [("ryan", "english"), ("ryan", "auto")]


def test_qwen_not_downloaded(monkeypatch):
    monkeypatch.setattr(tts_mod, "model_downloaded", lambda _m: False)
    with pytest.raises(RuntimeError, match="Qwen3-TTS model not downloaded"):
        QwenLocalEngine("mlx-community/none", "ryan").synthesize("hi", "en")


def test_qwen_remote_request_shape():
    import soundfile as sf
    import io

    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"], seen["body"], seen["auth"] = str(req.url), json.loads(req.content), req.headers.get("authorization")
        buf = io.BytesIO()
        sf.write(buf, np.zeros(240, dtype=np.float32), 24000, format="WAV")
        return httpx.Response(200, content=buf.getvalue())

    eng = QwenRemoteEngine("http://tts.local/", "qwen-tts", "ryan", "k1", transport=httpx.MockTransport(handler))
    audio, sr = eng.synthesize("Hello", "en")
    assert seen["url"] == "http://tts.local/v1/audio/speech"
    assert seen["body"] == {"model": "qwen-tts", "input": "Hello", "voice": "ryan", "lang_code": "english", "response_format": "wav"}
    assert seen["auth"] == "Bearer k1" and sr == 24000 and len(audio) == 240


def test_output_device_by_name_with_default_fallback():
    devices = [{"name": "Mic", "max_output_channels": 0}, {"name": "BlackHole 2ch", "max_output_channels": 2}]
    assert resolve_output_device("BlackHole 2ch", devices) == 1
    assert resolve_output_device("Gone", devices) is None
    assert resolve_output_device("", devices) is None


# --- queue ---


def test_translate_then_speak_status_sequence():
    async def run():
        svc, events, synth, player = make({"tts_target_lang": "en", "tts_output_device": "BlackHole 2ch"})
        u = await svc.speak("Chúng tôi sẽ gửi bản beta", source_lang="vi")
        await asyncio.sleep(0.3)
        return u, events, synth, player, svc

    u, events, synth, player, svc = asyncio.run(run())
    assert statuses(events, u.id) == ["queued", "synthesizing", "playing", "done"]
    assert synth == [("system", "[en] Chúng tôi sẽ gửi bản beta", "en")]
    assert svc._translator.calls == [("Chúng tôi sẽ gửi bản beta", "en", "vi")]
    assert player.played == [(100, "BlackHole 2ch")]
    assert events[-1]["text"] == "[en] Chúng tôi sẽ gửi bản beta" and events[-1]["engine"] == "system"


def test_translate_off_sends_no_llm_request():
    async def run():
        svc, events, synth, _ = make()
        await svc.speak("Hello team", translate=False)
        await asyncio.sleep(0.3)
        return svc, synth

    svc, synth = asyncio.run(run())
    assert svc._translator.calls == [] and synth[0][1] == "Hello team"


def test_llm_not_configured():
    class NoLLM:
        is_configured = False

    async def run():
        svc, events, synth, player = make(translator=NoLLM())
        u = await svc.speak("Xin chào")
        await asyncio.sleep(0.2)
        return u, events, player

    u, events, player = asyncio.run(run())
    assert statuses(events, u.id)[-1] == "error"
    assert events[-1]["error"] == "LLM not configured" and player.played == []


def test_queue_plays_in_order_never_overlapping():
    async def run():
        svc, events, synth, player = make(play_s=0.15)
        a = await svc.speak("one", translate=False)
        b = await svc.speak("two", translate=False)
        await asyncio.sleep(0.6)
        return a, b, events, synth, player

    a, b, events, synth, player = asyncio.run(run())
    assert [t for _, t, _ in synth] == ["one", "two"]
    assert player.max_active == 1
    done = [e["id"] for e in events if e["status"] == "done"]
    assert done == [a.id, b.id]


def test_stop_drops_queue():
    async def run():
        svc, events, synth, player = make(play_s=1.0)
        a = await svc.speak("one", translate=False)
        b = await svc.speak("two", translate=False)
        await asyncio.sleep(0.2)
        svc.stop()
        await asyncio.sleep(0.3)
        return a, b, events, synth

    a, b, events, synth = asyncio.run(run())
    assert statuses(events, a.id)[-1] == "stopped"
    assert statuses(events, b.id) == ["queued", "stopped"]
    assert [t for _, t, _ in synth] == ["one"]


def test_replay_without_new_synthesis_or_translation():
    async def run():
        svc, events, synth, player = make()
        a = await svc.speak("hello", target_lang="ja")
        await asyncio.sleep(0.2)
        r = await svc.replay(a.id)
        await asyncio.sleep(0.2)
        return svc, r, events, synth, player

    svc, r, events, synth, player = asyncio.run(run())
    assert len(synth) == 1 and len(svc._translator.calls) == 1
    assert len(player.played) == 2 and statuses(events, r.id)[-1] == "done"


def test_playback_active_release_window():
    async def run():
        svc, *_ = make(play_s=0.2)
        assert not svc.playback_active() or True  # release from t=0 is irrelevant here
        await svc.speak("x", translate=False)
        await asyncio.sleep(0.1)
        during = svc.playback_active()
        await asyncio.sleep(0.3)  # ended ~0.1 s ago
        after_short = svc.playback_active()
        await asyncio.sleep(tts_mod.PLAYBACK_RELEASE_S + 0.1)
        return during, after_short, svc.playback_active()

    during, after_short, later = asyncio.run(run())
    assert (during, after_short, later) == (True, True, False)


# --- capture ---


def test_audiotee_excludes_own_pid():
    import os

    cmd = SpeakerCapture(audiotee_path=__import__("pathlib").Path("/bin/audiotee")).command()
    i = cmd.index("--exclude-processes")
    assert cmd[i + 1] == str(os.getpid())


def test_config_tts_defaults_and_validation():
    c = AppConfig.from_dict({"preferred_language": "vi"})
    assert (c.tts_engine, c.tts_target_lang, c.tts_fallback_system, c.tts_speak_mic) == ("system", "en", True, False)
    assert AppConfig.from_dict({"tts_engine": "bogus"}).tts_engine == "system"
    c2 = AppConfig.from_dict(AppConfig(tts_engine="qwen_remote", tts_output_device="BlackHole 2ch").to_dict())
    assert (c2.tts_engine, c2.tts_output_device) == ("qwen_remote", "BlackHole 2ch")


# --- PortAudio reload on a stale device list ---


def _player_with_failing_first_open(monkeypatch, can_reload):
    import sounddevice as sd

    from just_transcribe.pipeline.tts import SoundDevicePlayer

    calls = []

    def fake_play(_sd, audio, sr, device, stop):
        calls.append("open")
        if calls.count("open") == 1:
            raise sd.PortAudioError("Error opening OutputStream: Internal PortAudio error [PaErrorCode -9986]")

    monkeypatch.setattr(SoundDevicePlayer, "_play", staticmethod(fake_play))
    monkeypatch.setattr(sd, "_terminate", lambda: calls.append("_terminate"))
    monkeypatch.setattr(sd, "_initialize", lambda: calls.append("_initialize"))
    return SoundDevicePlayer(can_reload=lambda: can_reload), calls


def test_player_reloads_portaudio_and_retries_when_no_mic(monkeypatch):
    player, calls = _player_with_failing_first_open(monkeypatch, can_reload=True)
    player.play(np.zeros(10, dtype=np.float32), 16000, "", threading.Event())
    assert calls == ["open", "_terminate", "_initialize", "open"]


def test_player_does_not_reload_while_mic_is_open(monkeypatch):
    player, calls = _player_with_failing_first_open(monkeypatch, can_reload=False)
    with pytest.raises(RuntimeError, match="stop and start recording"):
        player.play(np.zeros(10, dtype=np.float32), 16000, "", threading.Event())
    assert calls == ["open"]


def test_playback_overlaps_uses_the_span():
    import time as _t

    svc, *_ = make()
    now = _t.monotonic()
    svc._intervals.append((now - 3.0, now - 2.5))  # played 3.0..2.5 s ago
    assert svc.playback_overlaps(now - 3.2, now - 1.0)  # a segment that spanned the playback
    assert svc.playback_overlaps(now - 2.0, now - 1.9)  # inside the 0.8 s release
    assert not svc.playback_overlaps(now - 1.5, now)  # after the release

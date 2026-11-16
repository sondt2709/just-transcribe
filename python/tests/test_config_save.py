"""save_config keeps keys owned by the Electron main process."""

from just_transcribe.config import AppConfig, load_config, save_config


def test_save_keeps_electron_keys(tmp_path, monkeypatch):
    path = tmp_path / "config.toml"
    path.write_text(
        'preferred_language = "vi"\noverlay_enabled = true\noverlay_position = "top-right"\n'
        'launch_at_login = true\noverlay_bounds = "0.5,0.9,772,345"\n'
    )
    save_config(AppConfig(preferred_language="en", tts_engine="qwen_local"), path=path)
    text = path.read_text()
    assert 'overlay_enabled = true' in text and 'overlay_position = "top-right"' in text
    assert 'launch_at_login = true' in text and 'overlay_bounds = "0.5,0.9,772,345"' in text
    assert 'preferred_language = "en"' in text and 'tts_engine = "qwen_local"' in text


def test_save_creates_file(tmp_path):
    path = tmp_path / "config.toml"
    save_config(AppConfig(), path=path)
    assert 'tts_engine = "system"' in path.read_text()


def test_call_mic_defaults_and_invalid_mode():
    from just_transcribe.config import AppConfig

    old = AppConfig.from_dict({})
    assert old.call_mic_enabled is False and old.call_mic_mode == "voice_and_translation"
    assert AppConfig.from_dict({"call_mic_mode": "loud"}).call_mic_mode == "voice_and_translation"
    cfg = AppConfig.from_dict({"call_mic_enabled": True, "call_mic_mode": "translation_only"})
    assert cfg.to_dict()["call_mic_enabled"] is True and cfg.to_dict()["call_mic_mode"] == "translation_only"

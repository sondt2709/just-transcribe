# KMP Audio Streaming PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that an Android phone's microphone audio can be captured and streamed as raw PCM over a WebSocket to a Python server on macOS that plays it live, saves a `.wav`, and is verifiable by automated signal analysis.

**Architecture:** A Kotlin Multiplatform project with a `shared` module (Ktor WebSocket client + `expect/actual` mic capture) and a thin Android app shell. A Python server receives a JSON handshake then binary PCM frames, writing a WAV while playing live. A test harness drives the phone via `adb` intents, plays a chirp reference out the Mac speakers, and compares reference vs captured audio.

**Tech Stack:** Kotlin 2.3.21, AGP 8.13.2, Gradle 8.7, JDK 17, Ktor 3.5.0 (client + websockets + okhttp), kotlinx.serialization, Android `AudioRecord`; Python 3.11+ with `websockets`, `sounddevice`, `soundfile`, `scipy`, `numpy`, `pytest`, `pytest-asyncio`.

**Local references:** Offline docs live in `docs/refs/` (see `docs/refs/README.md`) — KMP `expect/actual`, Gradle, serialization, Flow (`kotlin/`), Ktor WebSockets + engines (`ktor/`), and AudioRecord (`android/`). Consult these before touching unfamiliar APIs; key correctness gotchas are distilled in the README.

---

## File Structure

```
audio-stream-poc/
├── server/                              # Python — built & tested FIRST (no device needed)
│   ├── requirements.txt                 # runtime + dev deps
│   ├── stream_config.py                 # StreamConfig dataclass (mirrors KMP)
│   ├── audio_sink.py                    # AudioSink: WAV write + optional live playback
│   ├── server.py                        # websockets server: handshake + binary frames
│   ├── make_reference.py                # generates reference.wav (chirp)
│   ├── analyze.py                        # compare(reference, captured) -> metrics + pass/fail
│   ├── run_e2e.py                        # orchestration harness (adb + playback + analyze)
│   └── tests/
│       ├── test_audio_sink.py
│       ├── test_server.py
│       └── test_analyze.py
└── kmp/                                  # Kotlin Multiplatform
    ├── settings.gradle.kts
    ├── gradle.properties
    ├── gradle/libs.versions.toml
    ├── shared/
    │   ├── build.gradle.kts
    │   └── src/
    │       ├── commonMain/kotlin/com/example/audiostreampoc/
    │       │   ├── StreamConfig.kt       # @Serializable, mirrors Python
    │       │   ├── AudioCapture.kt       # expect class
    │       │   ├── HttpClientFactory.kt  # expect fun platformHttpClient()
    │       │   └── AudioStreamer.kt       # Ktor WS client: handshake + binary pump
    │       ├── commonTest/kotlin/com/example/audiostreampoc/
    │       │   └── StreamConfigTest.kt
    │       └── androidMain/kotlin/com/example/audiostreampoc/
    │           ├── AudioCapture.android.kt    # actual: AudioRecord
    │           └── HttpClientFactory.android.kt # actual: OkHttp engine
    └── androidApp/
        ├── build.gradle.kts
        └── src/main/
            ├── AndroidManifest.xml
            └── kotlin/com/example/audiostreampoc/MainActivity.kt
```

**Decomposition rationale:** Python server is fully testable on the Mac with zero device dependency, so it's built and green first — it becomes the trusted receiver against which the Android side is validated. Within KMP, protocol (`StreamConfig`), capture (`AudioCapture`), transport (`AudioStreamer`), and engine (`HttpClientFactory`) are separate files with single responsibilities so each can be reasoned about in isolation. The Android app holds no business logic.

---

## Task 0: Prerequisites (verify environment)

**Files:** none (environment check only)

- [ ] **Step 1: Verify required tooling is present**

Run:
```bash
java -version           # expect 17.x
python3 --version       # expect 3.11+
adb version             # Android platform-tools present
echo "ANDROID_HOME=$ANDROID_HOME"   # must point at an Android SDK
ls "$ANDROID_HOME/platforms" 2>/dev/null   # expect android-36 (or install it)
gradle -version 2>/dev/null || echo "no system gradle — will install"
```
Expected: Java 17, Python 3.11+, `adb` prints a version, `ANDROID_HOME` set and contains `platforms/android-36`.

- [ ] **Step 2: Install missing macOS audio system libs**

Run:
```bash
brew install portaudio libsndfile gradle
```
Expected: all three installed (PortAudio backs `sounddevice`, libsndfile backs `soundfile`, gradle is needed once to generate the wrapper).

- [ ] **Step 3: Confirm a phone is connected and authorized**

Run: `adb devices`
Expected: exactly one device listed as `device` (not `unauthorized`/`offline`). If unauthorized, accept the USB-debugging prompt on the phone. This is the device used in Task 15.

No commit (read-only environment checks).

---

## Task 1: Python project scaffold

**Files:**
- Create: `server/requirements.txt`
- Create: `server/tests/__init__.py` (empty)

- [ ] **Step 1: Write `server/requirements.txt`**

```text
websockets==13.1
sounddevice==0.4.7
soundfile==0.13.1
numpy==2.1.3
scipy==1.14.1
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Create the test package marker**

Create empty file `server/tests/__init__.py`.

- [ ] **Step 3: Create venv and install**

Run:
```bash
cd server && python3 -m venv .venv && ./.venv/bin/pip install -q -r requirements.txt && ./.venv/bin/python -c "import websockets, sounddevice, soundfile, scipy, numpy; print('deps ok')"
```
Expected: prints `deps ok` (sounddevice import succeeds because portaudio was installed in Task 0).

- [ ] **Step 4: Commit**

```bash
git add server/requirements.txt server/tests/__init__.py
git commit -m "chore(server): add python deps and venv scaffold"
```

---

## Task 2: StreamConfig (Python side)

**Files:**
- Create: `server/stream_config.py`

- [ ] **Step 1: Write `server/stream_config.py`**

```python
"""Wire-protocol handshake config, mirrors the KMP StreamConfig."""
from dataclasses import dataclass


@dataclass
class StreamConfig:
    sample_rate: int
    channels: int = 1
    bit_depth: int = 16

    @property
    def sample_width(self) -> int:
        """Bytes per sample."""
        return self.bit_depth // 8

    @classmethod
    def from_hello(cls, msg: dict) -> "StreamConfig":
        """Build from a parsed 'hello' handshake dict; raises on bad shape."""
        if msg.get("type") != "hello":
            raise ValueError(f"expected hello handshake, got: {msg.get('type')!r}")
        return cls(
            sample_rate=int(msg["sampleRate"]),
            channels=int(msg["channels"]),
            bit_depth=int(msg["bitDepth"]),
        )
```

- [ ] **Step 2: Commit**

```bash
git add server/stream_config.py
git commit -m "feat(server): add StreamConfig handshake model"
```

---

## Task 3: AudioSink (WAV writer + playback)

**Files:**
- Create: `server/audio_sink.py`
- Test: `server/tests/test_audio_sink.py`

- [ ] **Step 1: Write the failing test `server/tests/test_audio_sink.py`**

```python
import wave
import numpy as np
from stream_config import StreamConfig
from audio_sink import AudioSink


def test_sink_writes_valid_wav_header_and_samples(tmp_path):
    cfg = StreamConfig(sample_rate=16000, channels=1, bit_depth=16)
    out = tmp_path / "out.wav"

    # 0.5s of a 440Hz sine as int16 little-endian bytes
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    pcm = (np.sin(2 * np.pi * 440 * t) * 0.5 * 32767).astype("<i2").tobytes()

    sink = AudioSink(cfg, str(out), playback=False)
    sink.write(pcm)
    sink.close()

    with wave.open(str(out), "rb") as w:
        assert w.getframerate() == 16000
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        assert w.getnframes() == 8000  # 16000 bytes / 2 bytes per sample
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_audio_sink.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'audio_sink'`.

- [ ] **Step 3: Write `server/audio_sink.py`**

```python
"""Receives PCM bytes: writes a WAV file and optionally plays live."""
import wave
from stream_config import StreamConfig


class AudioSink:
    def __init__(self, config: StreamConfig, wav_path: str, playback: bool = True):
        self.config = config
        self._wav = wave.open(wav_path, "wb")
        self._wav.setnchannels(config.channels)
        self._wav.setsampwidth(config.sample_width)
        self._wav.setframerate(config.sample_rate)
        self._stream = None
        if playback:
            import sounddevice as sd  # imported lazily so tests need no audio device
            self._stream = sd.RawOutputStream(
                samplerate=config.sample_rate,
                channels=config.channels,
                dtype="int16",
            )
            self._stream.start()

    def write(self, pcm: bytes) -> None:
        self._wav.writeframes(pcm)
        if self._stream is not None:
            self._stream.write(pcm)

    def close(self) -> None:
        self._wav.close()
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_audio_sink.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/audio_sink.py server/tests/test_audio_sink.py
git commit -m "feat(server): add AudioSink with WAV writer (TDD)"
```

---

## Task 4: WebSocket server

**Files:**
- Create: `server/server.py`
- Test: `server/tests/test_server.py`

- [ ] **Step 1: Write the failing test `server/tests/test_server.py`**

```python
import json
import wave
import asyncio
import numpy as np
import pytest
import websockets
from server import handle_connection

pytestmark = pytest.mark.asyncio


async def test_server_receives_handshake_and_writes_frames(tmp_path):
    out = tmp_path / "cap.wav"

    async def handler(ws):
        await handle_connection(ws, str(out), playback=False)

    async with websockets.serve(handler, "127.0.0.1", 0) as srv:
        port = srv.sockets[0].getsockname()[1]
        async with websockets.connect(f"ws://127.0.0.1:{port}/stream") as ws:
            await ws.send(json.dumps(
                {"type": "hello", "sampleRate": 16000, "channels": 1, "bitDepth": 16}))
            frame = (np.ones(1600, dtype="<i2") * 1000).tobytes()  # 3200 bytes
            await ws.send(frame)
            await ws.send(frame)
        await asyncio.sleep(0.1)  # let the server finish writing on close

    with wave.open(str(out), "rb") as w:
        assert w.getframerate() == 16000
        assert w.getnframes() == 3200  # 2 frames * 1600 samples
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_server.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server'` (or import error for `handle_connection`).

- [ ] **Step 3: Write `server/server.py`**

```python
"""WebSocket server: parses a 'hello' handshake, then writes binary PCM frames
to a WAV (and plays live unless disabled). Use --once for deterministic test runs."""
import argparse
import asyncio
import json
import datetime

import websockets

from stream_config import StreamConfig
from audio_sink import AudioSink


async def handle_connection(ws, out_path: str, playback: bool = True) -> None:
    raw = await ws.recv()
    msg = json.loads(raw)
    try:
        config = StreamConfig.from_hello(msg)
    except (ValueError, KeyError) as exc:
        await ws.close(code=1003, reason=str(exc))
        return

    sink = AudioSink(config, out_path, playback=playback)
    print(f"streaming -> {out_path} ({config.sample_rate}Hz "
          f"{config.channels}ch {config.bit_depth}bit)")
    frames = 0
    try:
        async for message in ws:
            if isinstance(message, (bytes, bytearray)):
                sink.write(bytes(message))
                frames += 1
    finally:
        sink.close()
        print(f"saved {out_path} ({frames} frames)")


async def serve(host: str, port: int, out: str, once: bool, playback: bool) -> None:
    done = asyncio.get_event_loop().create_future()

    async def handler(ws):
        await handle_connection(ws, out, playback=playback)
        if once and not done.done():
            done.set_result(None)

    async with websockets.serve(handler, host, port, max_size=None):
        print(f"listening on ws://{host}:{port}  (out={out}, once={once})")
        if once:
            await done
        else:
            await asyncio.Future()


def _default_out() -> str:
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"captured-{ts}.wav"


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--out", default=None)
    p.add_argument("--once", action="store_true",
                   help="serve a single connection then exit")
    p.add_argument("--no-playback", action="store_true",
                   help="disable live speaker playback")
    args = p.parse_args()
    asyncio.run(serve(
        args.host, args.port, args.out or _default_out(),
        once=args.once, playback=not args.no_playback,
    ))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_server.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/server.py server/tests/test_server.py
git commit -m "feat(server): add websocket server with handshake + frame sink (TDD)"
```

---

## Task 5: Reference chirp generator

**Files:**
- Create: `server/make_reference.py`

- [ ] **Step 1: Write `server/make_reference.py`**

```python
"""Generate a linear-sweep (chirp) reference.wav used by the e2e acoustic test.
A sweep is robust for cross-correlation alignment and spans the spectrum."""
import argparse
import numpy as np
import soundfile as sf
from scipy.signal import chirp


def make_reference(path: str = "reference.wav", fs: int = 16000,
                   duration: float = 6.0) -> str:
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)
    sweep = chirp(t, f0=200, f1=4000, t1=duration, method="linear")
    sweep = (sweep * 0.8).astype("float32")
    sf.write(path, sweep, fs, subtype="PCM_16")
    return path


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="reference.wav")
    p.add_argument("--fs", type=int, default=16000)
    p.add_argument("--duration", type=float, default=6.0)
    args = p.parse_args()
    out = make_reference(args.out, args.fs, args.duration)
    print(f"wrote {out}")
```

- [ ] **Step 2: Generate the reference file**

Run: `cd server && ./.venv/bin/python make_reference.py`
Expected: prints `wrote reference.wav`; `reference.wav` exists (~192 KB for 6s/16kHz/16-bit).

- [ ] **Step 3: Commit**

```bash
git add server/make_reference.py server/reference.wav
git commit -m "feat(server): add chirp reference generator and reference.wav"
```

---

## Task 6: Audio comparison analyzer

**Files:**
- Create: `server/analyze.py`
- Test: `server/tests/test_analyze.py`

- [ ] **Step 1: Write the failing test `server/tests/test_analyze.py`**

```python
import numpy as np
import soundfile as sf
from analyze import compare


def _write(path, data, fs=16000):
    sf.write(str(path), data.astype("float32"), fs, subtype="PCM_16")


def _ref(tmp_path):
    from scipy.signal import chirp
    fs = 16000
    t = np.linspace(0, 3.0, fs * 3, endpoint=False)
    ref = (chirp(t, 200, 3.0, 4000) * 0.8).astype("float32")
    p = tmp_path / "ref.wav"
    _write(p, ref)
    return p, ref, fs


def test_compare_passes_on_attenuated_delayed_noisy_copy(tmp_path):
    ref_path, ref, fs = _ref(tmp_path)
    # emulate the acoustic path: attenuate, delay 50ms, add mild noise
    delay = int(0.05 * fs)
    cap = np.zeros(len(ref) + delay, dtype="float32")
    cap[delay:] = ref * 0.4
    cap += np.random.default_rng(0).normal(0, 0.01, len(cap)).astype("float32")
    cap_path = tmp_path / "cap.wav"
    _write(cap_path, cap)

    metrics, passed = compare(str(ref_path), str(cap_path))
    assert passed, metrics
    assert metrics["peak_corr"] > 0.15
    assert metrics["not_silent"] is True


def test_compare_fails_on_silence(tmp_path):
    ref_path, ref, fs = _ref(tmp_path)
    cap_path = tmp_path / "silent.wav"
    _write(cap_path, np.zeros(len(ref), dtype="float32"))

    metrics, passed = compare(str(ref_path), str(cap_path))
    assert passed is False
    assert metrics["not_silent"] is False


def test_compare_fails_on_uncorrelated_noise(tmp_path):
    ref_path, ref, fs = _ref(tmp_path)
    noise = np.random.default_rng(1).normal(0, 0.3, len(ref)).astype("float32")
    cap_path = tmp_path / "noise.wav"
    _write(cap_path, noise)

    metrics, passed = compare(str(ref_path), str(cap_path))
    assert passed is False
    assert metrics["peak_corr"] < 0.15
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_analyze.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'analyze'`.

- [ ] **Step 3: Write `server/analyze.py`**

```python
"""Compare a captured recording against the reference signal and decide PASS/FAIL.

This is an ACOUSTIC loopback (speaker -> room -> mic), so thresholds are lenient:
the goal is to prove the pipeline faithfully carries real mic audio, not
bit-exactness. Cross-correlation against the known chirp proves the captured
content IS the reference (not silence or garbage)."""
import numpy as np
import soundfile as sf
import scipy.signal as sig

EPS = 1e-9


def _load_mono(path: str):
    data, fs = sf.read(path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    return data, fs


def compare(
    ref_path: str,
    cap_path: str,
    silence_floor: float = 1e-3,
    peak_corr_thr: float = 0.15,
    spectral_thr: float = 0.5,
    min_duration_ratio: float = 0.5,
    max_duration_ratio: float = 4.0,
):
    ref, fs_ref = _load_mono(ref_path)
    cap, fs_cap = _load_mono(cap_path)

    metrics: dict = {"fs_ref": fs_ref, "fs_cap": fs_cap}

    # Sample rates must match for a meaningful comparison.
    if fs_ref != fs_cap:
        metrics["error"] = f"sample-rate mismatch {fs_ref} vs {fs_cap}"
        return metrics, False

    dur_ref = len(ref) / fs_ref
    dur_cap = len(cap) / fs_cap
    metrics["dur_ref"] = round(dur_ref, 3)
    metrics["dur_cap"] = round(dur_cap, 3)
    duration_ok = (min_duration_ratio * dur_ref) <= dur_cap <= (max_duration_ratio * dur_ref)
    metrics["duration_ok"] = duration_ok

    rms_ref = float(np.sqrt(np.mean(ref ** 2)))
    rms_cap = float(np.sqrt(np.mean(cap ** 2)))
    metrics["rms_ref"] = round(rms_ref, 6)
    metrics["rms_cap"] = round(rms_cap, 6)
    metrics["rms_cap_db"] = round(20 * np.log10(rms_cap + EPS), 2)
    not_silent = rms_cap > silence_floor
    metrics["not_silent"] = not_silent

    # Normalized cross-correlation (alignment + similarity).
    corr = sig.correlate(cap, ref, mode="full", method="fft")
    corr /= (np.linalg.norm(ref) * np.linalg.norm(cap) + EPS)
    peak_idx = int(np.argmax(np.abs(corr)))
    peak_corr = float(np.abs(corr[peak_idx]))
    lag = peak_idx - (len(ref) - 1)
    metrics["peak_corr"] = round(peak_corr, 4)
    metrics["lag_ms"] = round(lag / fs_ref * 1000, 1)

    # Spectral similarity (log power spectrum correlation).
    _, psd_ref = sig.welch(ref, fs=fs_ref, nperseg=1024)
    _, psd_cap = sig.welch(cap, fs=fs_cap, nperseg=1024)
    spectral_corr = float(np.corrcoef(np.log1p(psd_ref), np.log1p(psd_cap))[0, 1])
    metrics["spectral_corr"] = round(spectral_corr, 4)

    passed = bool(
        not_silent
        and duration_ok
        and peak_corr > peak_corr_thr
        and spectral_corr > spectral_thr
    )
    metrics["passed"] = passed
    return metrics, passed


if __name__ == "__main__":
    import argparse
    import json
    p = argparse.ArgumentParser()
    p.add_argument("reference")
    p.add_argument("captured")
    args = p.parse_args()
    metrics, passed = compare(args.reference, args.captured)
    print(json.dumps(metrics, indent=2))
    print("PASS" if passed else "FAIL")
    raise SystemExit(0 if passed else 1)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ./.venv/bin/python -m pytest tests/test_analyze.py -v`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the full Python suite**

Run: `cd server && ./.venv/bin/python -m pytest -v`
Expected: PASS (all tests across the three files).

- [ ] **Step 6: Commit**

```bash
git add server/analyze.py server/tests/test_analyze.py
git commit -m "feat(server): add audio comparison analyzer (TDD)"
```

---

## Task 7: KMP Gradle scaffold

**Files:**
- Create: `kmp/settings.gradle.kts`
- Create: `kmp/gradle.properties`
- Create: `kmp/gradle/libs.versions.toml`
- Create: `kmp/shared/build.gradle.kts`
- Create: `kmp/androidApp/build.gradle.kts`
- Create: `kmp/local.properties` (git-ignored)

- [ ] **Step 1: Write `kmp/settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "AudioStreamPoc"
include(":shared", ":androidApp")
```

- [ ] **Step 2: Write `kmp/gradle.properties`**

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
```

- [ ] **Step 3: Write `kmp/gradle/libs.versions.toml`**

```toml
[versions]
kotlin = "2.3.21"
agp = "8.13.2"
ktor = "3.5.0"
coroutines = "1.9.0"
serialization = "1.7.3"
androidxCore = "1.13.1"
androidxActivity = "1.9.3"
androidxLifecycle = "2.8.7"
compileSdk = "36"
minSdk = "26"
targetSdk = "36"

[libraries]
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-websockets = { module = "io.ktor:ktor-client-websockets", version.ref = "ktor" }
ktor-client-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "androidxCore" }
androidx-activity-ktx = { module = "androidx.activity:activity-ktx", version.ref = "androidxActivity" }
androidx-lifecycle-runtime-ktx = { module = "androidx.lifecycle:lifecycle-runtime-ktx", version.ref = "androidxLifecycle" }

[plugins]
kotlinMultiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
kotlinSerialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
androidLibrary = { id = "com.android.library", version.ref = "agp" }
androidApplication = { id = "com.android.application", version.ref = "agp" }
kotlinAndroid = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
```

- [ ] **Step 4: Write `kmp/shared/build.gradle.kts`**

```kotlin
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.androidLibrary)
}

kotlin {
    // NOTE: AGP-9 migration would replace androidTarget {} + the android {} block
    // below with the com.android.kotlin.multiplatform.library plugin's
    // androidLibrary {} block. Staying on AGP 8.x here for stability.
    androidTarget {
        compilations.all {
            compileTaskProvider.configure {
                compilerOptions {
                    jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
                }
            }
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.websockets)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
        }
    }
}

android {
    namespace = "com.example.audiostreampoc.shared"
    compileSdk = libs.versions.compileSdk.get().toInt()
    defaultConfig {
        minSdk = libs.versions.minSdk.get().toInt()
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
```

- [ ] **Step 5: Write `kmp/androidApp/build.gradle.kts`**

```kotlin
plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
}

android {
    namespace = "com.example.audiostreampoc"
    compileSdk = libs.versions.compileSdk.get().toInt()
    defaultConfig {
        applicationId = "com.example.audiostreampoc"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildTypes {
        getByName("debug") { isDebuggable = true }
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
}
```

- [ ] **Step 6: Write `kmp/local.properties`** (points Gradle at the SDK; git-ignored)

```properties
sdk.dir=/Users/sondt/Library/Android/sdk
```
(Adjust the path if `ANDROID_HOME` from Task 0 differs.)

- [ ] **Step 7: Generate the Gradle wrapper (pinned to 8.7)**

Run: `cd kmp && gradle wrapper --gradle-version 8.7`
Expected: creates `kmp/gradlew`, `kmp/gradlew.bat`, `kmp/gradle/wrapper/gradle-wrapper.{jar,properties}`.

- [ ] **Step 8: Commit**

```bash
git add kmp/settings.gradle.kts kmp/gradle.properties kmp/gradle/ kmp/shared/build.gradle.kts kmp/androidApp/build.gradle.kts kmp/gradlew kmp/gradlew.bat
git commit -m "chore(kmp): add gradle scaffold, version catalog, and wrapper"
```
(`kmp/local.properties` is intentionally not committed — it's in `.gitignore`.)

---

## Task 8: StreamConfig (KMP) + round-trip test

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/StreamConfig.kt`
- Test: `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/StreamConfigTest.kt`

- [ ] **Step 1: Write the failing test `StreamConfigTest.kt`**

```kotlin
package com.example.audiostreampoc

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class StreamConfigTest {
    @Test
    fun encodes_hello_handshake_with_expected_fields() {
        val json = Json.encodeToString(StreamConfig(sampleRate = 16000))
        // type defaults to "hello", channels=1, bitDepth=16
        assertEquals(
            """{"type":"hello","sampleRate":16000,"channels":1,"bitDepth":16}""",
            json,
        )
    }

    @Test
    fun round_trips_through_json() {
        val original = StreamConfig(sampleRate = 44100, channels = 1, bitDepth = 16)
        val decoded = Json.decodeFromString<StreamConfig>(Json.encodeToString(original))
        assertEquals(original, decoded)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "com.example.audiostreampoc.StreamConfigTest"`
Expected: FAIL — compilation error, `StreamConfig` unresolved.

- [ ] **Step 3: Write `StreamConfig.kt`**

```kotlin
package com.example.audiostreampoc

import kotlinx.serialization.Serializable

/** Wire-protocol handshake, mirrors the Python StreamConfig. Field ORDER and
 *  names must match the JSON the server expects: type, sampleRate, channels, bitDepth. */
@Serializable
data class StreamConfig(
    val type: String = "hello",
    val sampleRate: Int,
    val channels: Int = 1,
    val bitDepth: Int = 16,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "com.example.audiostreampoc.StreamConfigTest"`
Expected: PASS (2 tests). The first build downloads dependencies — allow a few minutes.

- [ ] **Step 5: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/StreamConfig.kt kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/StreamConfigTest.kt
git commit -m "feat(shared): add StreamConfig handshake model with JSON test (TDD)"
```

---

## Task 9: AudioCapture expect + HttpClient factory expect

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioCapture.kt`
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/HttpClientFactory.kt`

- [ ] **Step 1: Write `AudioCapture.kt` (expect declaration)**

```kotlin
package com.example.audiostreampoc

import kotlinx.coroutines.flow.Flow

/**
 * Platform microphone capture. Resolves a usable sample rate at construction
 * (prefers 16000 Hz, falls back to 44100 Hz) and exposes raw PCM 16-bit mono
 * frames as a cold Flow. Collecting starts the mic; cancelling the collector
 * stops and releases it.
 */
expect class AudioCapture() {
    /** The sample rate actually in use (16000 if supported, else 44100). */
    val sampleRate: Int

    /** Cold flow of raw little-endian PCM 16-bit mono byte chunks (~100ms each). */
    fun pcmFrames(): Flow<ByteArray>
}
```

- [ ] **Step 2: Write `HttpClientFactory.kt` (expect declaration)**

```kotlin
package com.example.audiostreampoc

import io.ktor.client.HttpClient

/** Creates a platform HttpClient with the WebSockets plugin installed. */
expect fun platformHttpClient(): HttpClient
```

- [ ] **Step 3: Verify it compiles for common (expect without actual will fail Android compile later, so only check common metadata)**

Run: `cd kmp && ./gradlew :shared:compileKotlinMetadata`
Expected: PASS (common code compiles; actuals are added in the next task).

- [ ] **Step 4: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioCapture.kt kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/HttpClientFactory.kt
git commit -m "feat(shared): add AudioCapture and HttpClient expect declarations"
```

---

## Task 10: Android actuals (AudioRecord + OkHttp client)

**Files:**
- Create: `kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/AudioCapture.android.kt`
- Create: `kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/HttpClientFactory.android.kt`

- [ ] **Step 1: Write `AudioCapture.android.kt` (actual)**

```kotlin
package com.example.audiostreampoc

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive

private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
private const val FRAME_BYTES = 3200 // ~100ms at 16kHz/16-bit mono

/** Requires RECORD_AUDIO to have been granted before pcmFrames() is collected. */
actual class AudioCapture actual constructor() {
    actual val sampleRate: Int = resolveSampleRate()

    actual fun pcmFrames(): Flow<ByteArray> = flow {
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, CHANNEL, ENCODING)
        val bufferBytes = maxOf(minBuf, FRAME_BYTES) * 2
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            CHANNEL,
            ENCODING,
            bufferBytes,
        )
        check(recorder.state == AudioRecord.STATE_INITIALIZED) {
            "AudioRecord failed to initialize"
        }
        val buffer = ByteArray(FRAME_BYTES)
        recorder.startRecording()
        try {
            while (currentCoroutineContext().isActive) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read > 0) emit(buffer.copyOf(read))
            }
        } finally {
            recorder.stop()
            recorder.release()
        }
    }.flowOn(Dispatchers.IO)

    private companion object {
        fun resolveSampleRate(): Int {
            for (rate in intArrayOf(16000, 44100)) {
                val mb = AudioRecord.getMinBufferSize(rate, CHANNEL, ENCODING)
                if (mb != AudioRecord.ERROR && mb != AudioRecord.ERROR_BAD_VALUE) return rate
            }
            error("No supported PCM 16-bit mono sample rate on this device")
        }
    }
}
```

- [ ] **Step 2: Write `HttpClientFactory.android.kt` (actual)**

```kotlin
package com.example.audiostreampoc

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.websocket.WebSockets
import java.util.concurrent.TimeUnit

actual fun platformHttpClient(): HttpClient = HttpClient(OkHttp) {
    install(WebSockets)
    // NOTE: the OkHttp engine ignores WebSockets.Config.pingIntervalMillis — the
    // keep-alive ping MUST be set on the OkHttp builder via engine { config { } }.
    // (See docs/refs/ktor/client-engines.md.)
    engine {
        config {
            pingInterval(20, TimeUnit.SECONDS)
        }
    }
}
```

- [ ] **Step 3: Verify the shared module assembles for Android**

Run: `cd kmp && ./gradlew :shared:assembleDebug`
Expected: PASS (expect/actual now resolved; AAR builds).

- [ ] **Step 4: Commit**

```bash
git add kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/AudioCapture.android.kt kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/HttpClientFactory.android.kt
git commit -m "feat(shared): add Android AudioRecord + OkHttp actuals"
```

---

## Task 11: AudioStreamer (Ktor WebSocket pump)

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioStreamer.kt`

- [ ] **Step 1: Write `AudioStreamer.kt`**

```kotlin
package com.example.audiostreampoc

import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.HttpMethod
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import kotlinx.coroutines.flow.collect
import kotlinx.serialization.json.Json

/**
 * Opens a WebSocket to ws://host:port/stream, sends the JSON handshake as a
 * text frame, then streams PCM chunks from [capture] as binary frames until
 * the flow completes or the coroutine is cancelled.
 */
class AudioStreamer(private val client: HttpClient) {

    suspend fun stream(host: String, port: Int, capture: AudioCapture) {
        val config = StreamConfig(sampleRate = capture.sampleRate)
        client.webSocket(method = HttpMethod.Get, host = host, port = port, path = "/stream") {
            send(Frame.Text(Json.encodeToString(config)))
            capture.pcmFrames().collect { chunk ->
                send(Frame.Binary(fin = true, data = chunk))
            }
            close(CloseReason(CloseReason.Codes.NORMAL, "done"))
        }
    }
}
```

- [ ] **Step 2: Verify the shared module still assembles**

Run: `cd kmp && ./gradlew :shared:assembleDebug`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioStreamer.kt
git commit -m "feat(shared): add AudioStreamer websocket pump"
```

---

## Task 12: Android app — manifest

**Files:**
- Create: `kmp/androidApp/src/main/AndroidManifest.xml`

- [ ] **Step 1: Write `AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="AudioStreamPoc"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```
(`usesCleartextTraffic="true"` is required because we use `ws://` over the LAN, not `wss://`. `exported="true"` lets the `adb am start` harness launch it.)

- [ ] **Step 2: Commit**

```bash
git add kmp/androidApp/src/main/AndroidManifest.xml
git commit -m "feat(app): add Android manifest with RECORD_AUDIO + cleartext"
```

---

## Task 13: Android app — MainActivity

**Files:**
- Create: `kmp/androidApp/src/main/kotlin/com/example/audiostreampoc/MainActivity.kt`

- [ ] **Step 1: Write `MainActivity.kt`**

```kotlin
package com.example.audiostreampoc

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var hostField: EditText
    private lateinit var portField: EditText
    private lateinit var statusView: TextView
    private lateinit var toggleButton: Button

    private val client by lazy { platformHttpClient() }
    private var streamJob: Job? = null

    // Pending auto-start params captured before permission resolves.
    private var pendingHost: String? = null
    private var pendingPort: Int = 8765
    private var pendingDurationMs: Long = 0L

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                val h = pendingHost ?: hostField.text.toString()
                startStreaming(h, pendingPort, pendingDurationMs)
            } else {
                setStatus("Microphone permission required")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        hostField = EditText(this).apply { hint = "Mac LAN IP (e.g. 192.168.1.50)" }
        portField = EditText(this).apply { setText("8765") }
        statusView = TextView(this).apply { text = "Idle" }
        toggleButton = Button(this).apply {
            text = "Start"
            setOnClickListener { onToggle() }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
            addView(hostField)
            addView(portField)
            addView(toggleButton)
            addView(statusView)
        })

        // Automation entry point: adb am start ... --es host --ei port --ez autostart --ei durationMs
        val autostart = intent.getBooleanExtra("autostart", false)
        if (autostart) {
            val host = intent.getStringExtra("host") ?: "127.0.0.1"
            val port = intent.getIntExtra("port", 8765)
            val durationMs = intent.getIntExtra("durationMs", 0).toLong()
            hostField.setText(host)
            portField.setText(port.toString())
            requestThenStart(host, port, durationMs)
        }
    }

    private fun onToggle() {
        if (streamJob?.isActive == true) {
            stopStreaming()
        } else {
            val host = hostField.text.toString()
            val port = portField.text.toString().toIntOrNull() ?: 8765
            requestThenStart(host, port, durationMs = 0L)
        }
    }

    private fun requestThenStart(host: String, port: Int, durationMs: Long) {
        pendingHost = host
        pendingPort = port
        pendingDurationMs = durationMs
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            startStreaming(host, port, durationMs)
        } else {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun startStreaming(host: String, port: Int, durationMs: Long) {
        if (streamJob?.isActive == true) return
        toggleButton.text = "Stop"
        setStatus("Streaming to $host:$port")
        streamJob = lifecycleScope.launch {
            val capture = AudioCapture()
            val streamer = AudioStreamer(client)
            if (durationMs > 0) {
                launch {
                    delay(durationMs)
                    stopStreaming()
                }
            }
            try {
                streamer.stream(host, port, capture)
            } catch (e: Throwable) {
                setStatus("Connection failed: ${e.message}")
            } finally {
                onStreamEnded()
            }
        }
    }

    private fun stopStreaming() {
        streamJob?.cancel()
        streamJob = null
    }

    private fun onStreamEnded() {
        toggleButton.text = "Start"
        if (statusView.text.toString().startsWith("Streaming")) setStatus("Idle")
    }

    private fun setStatus(text: String) {
        runOnUiThread { statusView.text = text }
    }

    override fun onStop() {
        super.onStop()
        stopStreaming()
    }

    override fun onDestroy() {
        super.onDestroy()
        client.close()
    }
}
```

- [ ] **Step 2: Assemble the debug APK**

Run: `cd kmp && ./gradlew :androidApp:assembleDebug`
Expected: PASS; APK at `kmp/androidApp/build/outputs/apk/debug/androidApp-debug.apk`.

- [ ] **Step 3: Commit**

```bash
git add kmp/androidApp/src/main/kotlin/com/example/audiostreampoc/MainActivity.kt
git commit -m "feat(app): add MainActivity UI, permission flow, and adb autostart hook"
```

---

## Task 14: E2E orchestration harness

**Files:**
- Create: `server/run_e2e.py`

- [ ] **Step 1: Write `server/run_e2e.py`**

```python
"""End-to-end acoustic test harness (Tier 1).

Starts the server (--once), launches the Android app via adb with autostart,
plays the chirp reference out the Mac speakers, waits for capture, then runs
the analyzer. Prints PASS/FAIL.

Usage:
  ./.venv/bin/python run_e2e.py --mac-ip 192.168.1.50 --duration 6
"""
import argparse
import subprocess
import sys
import threading
import time

import soundfile as sf
import sounddevice as sd

from analyze import compare

APP_COMPONENT = "com.example.audiostreampoc/.MainActivity"


def play_reference(path: str) -> None:
    data, fs = sf.read(path, dtype="float32")
    sd.play(data, fs)
    sd.wait()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--mac-ip", required=True, help="this Mac's LAN IP the phone connects to")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--duration", type=float, default=6.0, help="seconds to record")
    p.add_argument("--reference", default="reference.wav")
    p.add_argument("--out", default="captured-e2e.wav")
    args = p.parse_args()

    duration_ms = int(args.duration * 1000) + 1000  # record slightly longer than playback

    # 1. Start the server (single connection, no local playback — phone audio
    #    is what we analyze; double playback would be confusing).
    server = subprocess.Popen(
        [sys.executable, "server.py", "--port", str(args.port),
         "--out", args.out, "--once", "--no-playback"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    time.sleep(1.5)  # let the server bind

    try:
        # 2. Grant permission up front so no dialog blocks autostart.
        subprocess.run(["adb", "shell", "pm", "grant",
                        "com.example.audiostreampoc",
                        "android.permission.RECORD_AUDIO"], check=False)

        # 3. Launch the app with autostart.
        subprocess.run([
            "adb", "shell", "am", "start", "-W",
            "-n", APP_COMPONENT,
            "--es", "host", args.mac_ip,
            "--ei", "port", str(args.port),
            "--ez", "autostart", "true",
            "--ei", "durationMs", str(duration_ms),
        ], check=True)

        # 4. Play the reference out the speakers in a thread; phone mic captures it.
        time.sleep(0.5)  # small lead so streaming is live before sound starts
        t = threading.Thread(target=play_reference, args=(args.reference,))
        t.start()
        t.join()

        # 5. Wait for the app's durationMs to elapse and the socket to close.
        try:
            server.wait(timeout=duration_ms / 1000 + 5)
        except subprocess.TimeoutExpired:
            server.terminate()
    finally:
        if server.poll() is None:
            server.terminate()
        print(server.communicate()[0])

    # 6. Analyze.
    metrics, passed = compare(args.reference, args.out)
    import json
    print(json.dumps(metrics, indent=2))
    print("E2E PASS" if passed else "E2E FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Commit**

```bash
git add server/run_e2e.py
git commit -m "feat(server): add e2e acoustic test harness (adb + playback + analyze)"
```

---

## Task 15: Tier-1 acoustic verification run

**Files:** none (execution + verification)

- [ ] **Step 1: Install the app on the connected phone**

Run: `cd kmp && ./gradlew :androidApp:installDebug`
Expected: `Installed on 1 device`.

- [ ] **Step 2: Find this Mac's LAN IP**

Run: `ipconfig getifaddr en0 || ipconfig getifaddr en1`
Expected: an IP like `192.168.x.y`. Use it as `--mac-ip`. Confirm the phone is on the same wifi.

- [ ] **Step 3: Position the phone near the Mac speakers, set a moderate volume, then run the harness**

Run: `cd server && ./.venv/bin/python run_e2e.py --mac-ip <MAC_IP> --duration 6`
Expected: the app launches and streams, the chirp plays from the speakers, the server prints `saved captured-e2e.wav (N frames)`, the analyzer prints a metrics JSON, and the final line is `E2E PASS`.

- [ ] **Step 4: If FAIL, diagnose using the metrics (calibration pass)**

Interpretation:
- `not_silent: false` → phone never captured the chirp: check volume, phone-mic proximity, RECORD_AUDIO grant, and that frames were received (server "N frames" > 0).
- `peak_corr` low but `not_silent: true` → audio captured but weak alignment: raise volume / reduce room noise / move phone closer; re-run to establish a realistic baseline. Lenient default thresholds (`peak_corr_thr=0.15`) already account for acoustic loss — only adjust in `analyze.py` if a clearly-good recording still fails.
- server "0 frames" → connectivity: confirm `--mac-ip` is reachable from the phone (same wifi, no AP isolation) and `usesCleartextTraffic` is set.

Re-run Step 3 until `E2E PASS`. This is the programmatic acceptance gate — do not proceed to Tier 2 until it is green.

- [ ] **Step 5: Commit a known-good captured artifact for the record (optional)**

```bash
cp server/captured-e2e.wav server/captured-e2e.known-good.wav
git add server/captured-e2e.known-good.wav
git commit -m "test: add known-good e2e capture artifact"
```
(Plain `captured*.wav` stays git-ignored; this renamed copy is the durable evidence.)

---

## Task 16: Tier-2 manual ear check (user sign-off)

**Files:** none (manual)

- [ ] **Step 1: Live listen**

Start the server with playback on: `cd server && ./.venv/bin/python server.py --port 8765 --out captured-live.wav`. On the phone, open AudioStreamPoc, enter the Mac IP + port, tap **Start**, and speak. Confirm you hear your voice live from the Mac speakers with acceptable latency. Tap **Stop**.

- [ ] **Step 2: Replay the capture**

Run: `afplay server/captured-live.wav`
Expected: your recorded speech plays back clearly.

- [ ] **Step 3: Sign off**

If both sound correct to your ear, the PoC is verified end-to-end. The Android mic → WebSocket → Mac pipeline is proven and the `shared` module is ready to be lifted into the real transcribe+translate app.

---

## Self-Review Notes

- **Spec coverage:** KMP shared module + Android target (Tasks 7–13); raw PCM 16-bit 16kHz mono with 44.1k fallback (Task 10 `resolveSampleRate`); Ktor client + OkHttp (Tasks 7, 10, 11); JSON handshake protocol (Tasks 2, 8); Python server with live playback + WAV (Tasks 3, 4); intent-extra automation hook (Task 13); chirp reference + analyzer (Tasks 5, 6); two-tier testing — programmatic acoustic e2e (Tasks 14–15) then manual ear check (Task 16); error handling for permission/connection/init failures (Tasks 4 server-side, 10 init guard, 13 UI). All spec sections map to a task.
- **Type consistency:** `StreamConfig{type,sampleRate,channels,bitDepth}` matches between Kotlin (Task 8) and Python (`sample_rate,channels,bit_depth` from the same JSON keys, Task 2). `AudioCapture().sampleRate` / `pcmFrames()` (Tasks 9/10) match usage in `AudioStreamer.stream(host,port,capture)` (Task 11) and `MainActivity` (Task 13). `platformHttpClient()` (Tasks 9/10) used in Task 13. `compare(ref,cap) -> (metrics, passed)` consistent across Tasks 6 and 14. `AudioSink(config, path, playback)` / `.write` / `.close` consistent Tasks 3–4.
- **Acoustic caveat** is carried into Task 6 docstring and Task 15 calibration step, matching the spec's deliberate design decision.

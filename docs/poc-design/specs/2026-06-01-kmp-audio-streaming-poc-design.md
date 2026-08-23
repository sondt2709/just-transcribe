# KMP Audio Streaming PoC — Design

**Date:** 2026-06-01
**Status:** Approved (design phase)

## 1. Purpose & Scope

De-risk the audio-streaming layer for a future Android-native realtime transcribe + translate app. The hard part today is reliable microphone capture and streaming on Android. This PoC proves exactly one thing end-to-end:

> **Phone microphone → WebSocket → audible and inspectable audio on the MacBook.**

It does **not** implement transcription or translation. Those come later, on top of a streaming layer we trust.

### Success criterion

A frequency-sweep signal played from the Mac speakers is captured by the phone mic, streamed over a WebSocket, written to a `.wav` on the Mac, and verified — first **programmatically** (signal analysis), then **by ear**.

### Out of scope (YAGNI)

Opus/compression, iOS target, reconnect/buffering resilience, the actual transcribe+translate, auth/TLS, multi-client.

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Project shape | Proper KMP: `shared` module (`expect/actual`) + Android app target | Matches final architecture; reusable streaming layer |
| Audio format | Raw PCM, signed 16-bit LE, **16 kHz mono** | Simplest, most reliable, ideal for ASR end goal |
| Roles | Android = WebSocket **client**; Python = WebSocket **server** | — |
| Verification | Live playback **+** `.wav` file on Mac | Catches realtime issues and gives a durable artifact |
| Test device | Physical Android phone on same wifi → Mac LAN IP | Realistic mic behavior; emulator capture is unreliable |
| WebSocket lib | **Ktor client 3.5.0** WebSockets (commonMain) + OkHttp engine (androidMain) | Only truly multiplatform WS lib; sets up iOS later |
| Mic capture | Android **`AudioRecord`** | The standard Android mic API; the part being de-risked |
| Python stack | `websockets` (server) + `sounddevice` (playback) + stdlib `wave`; `soundfile` + `scipy.signal` for analysis | Low-friction, reliable on macOS |

## 3. Toolchain (pinned, verified June 2026)

- Kotlin **2.3.21**, AGP **8.13.2**, Gradle **8.4+**, JDK **17**
- `compileSdk = 36`, `minSdk = 26`
- Deliberately on the **AGP 8.x path** (`com.android.library` + `androidTarget {}`) for the shared module. Kotlin 2.3 + AGP **9** would force the newer `com.android.kotlin.multiplatform.library` plugin — real, but less battle-tested. Unnecessary risk for a PoC; a code comment will note the AGP-9 migration path.
- Ktor **3.5.0**: `ktor-client-core` + `ktor-client-websockets` in `commonMain`; `ktor-client-okhttp` in `androidMain` (Ktor's recommended Android engine, API 21+).

## 4. Project Layout

```
audio-stream-poc/
├── kmp/                                  # Kotlin Multiplatform project (Gradle)
│   ├── settings.gradle.kts
│   ├── gradle/libs.versions.toml
│   ├── shared/
│   │   ├── build.gradle.kts
│   │   └── src/
│   │       ├── commonMain/kotlin/
│   │       │   ├── AudioStreamer.kt      # Ktor WS client: handshake + binary pump
│   │       │   ├── AudioCapture.kt       # expect: produces Flow<ByteArray> of PCM
│   │       │   └── StreamConfig.kt       # sampleRate/channels/bitDepth + JSON handshake
│   │       └── androidMain/kotlin/
│   │           └── AudioCapture.android.kt   # actual: AudioRecord
│   └── androidApp/
│       └── src/main/.../MainActivity.kt  # host:port UI, Start/Stop, status, intent extras
└── server/
    ├── server.py                         # websockets + sounddevice + wave
    ├── analyze.py                        # soundfile + scipy.signal comparison
    ├── reference.wav                     # frequency-sweep test signal
    └── requirements.txt
```

**Boundary intent:** all reusable logic lives in `shared`; `androidApp` is a dumb shell (UI + permission + wiring). This is what makes it a real KMP PoC and lets `shared` be lifted into the eventual app.

## 5. Wire Protocol & Data Flow

**Connection:** Android client → `ws://<mac-lan-ip>:8765/stream` (Python server). Same wifi.

**Message sequence:**

1. **Handshake** (text frame, first message):
   ```json
   { "type": "hello", "sampleRate": 16000, "channels": 1, "bitDepth": 16 }
   ```
   Server uses this to configure both the `sounddevice` output stream and the `.wav` header. Self-describing = robust to a format change (e.g. 44.1 kHz fallback).
2. **Audio** (binary frames): raw PCM chunks, ~100 ms each (16000 × 2 bytes × 0.1 s = **3200 bytes/frame**), ~10 frames/sec. Sent via `send(Frame.Binary(fin = true, data = chunk))` (Ktor 3.x requires explicit `Frame.Binary`).
3. **Stop:** user taps Stop / app backgrounds / `durationMs` elapses → client closes the socket (`CloseReason.Codes.NORMAL`). Server treats close as end-of-session and finalizes the `.wav`.

**Capture loop (androidMain):** `AudioRecord` with `MediaRecorder.AudioSource.MIC`, 16 kHz, `CHANNEL_IN_MONO`, `ENCODING_PCM_16BIT`, buffer = `max(getMinBufferSize, 3200) × 2`. A coroutine on `Dispatchers.IO` runs the blocking `read()` loop (never on main thread → ANR) and emits chunks into `Flow<ByteArray>`. `AudioStreamer` collects the flow and sends each chunk as a binary frame.

**Server loop (Python):** accept → parse `hello` → open `sounddevice.RawOutputStream` + `wave` writer → per binary frame: `stream.write(frame)` **and** `wav.writeframes(frame)` → on disconnect: flush/close both in a `finally`, print saved path.

**Backpressure:** trivial on local wifi (~256 kbps). `sounddevice` buffers internally; a playback underrun is a minor live glitch only — the `.wav` is written independently of playback timing, so it stays clean.

## 6. Error Handling & Edge Cases

**Android**
- **Permission:** request `RECORD_AUDIO` at runtime before capture; denied → status "Microphone permission required", no crash.
- **Connection failure** (bad IP / server down): Ktor connect throws → caught → status "Connection failed: <reason>", Start re-enabled.
- **Mid-stream disconnect:** capture loop cancelled, `AudioRecord` released, status → idle.
- **`AudioRecord` init failure** (rate rejected): `getMinBufferSize` guarded against `ERROR`/`ERROR_BAD_VALUE`; retry at 44.1 kHz and reflect actual rate in handshake; if that also fails → status error.
- **Lifecycle:** stop capture + close socket in `onStop()` so backgrounding doesn't leak mic or socket. Never `release()` without `stop()` first.

**Python server**
- Bind `0.0.0.0:8765` so the phone reaches it over LAN; print listening address on startup.
- Malformed/missing handshake → reject connection, log error.
- Client disconnect (normal or abrupt) → always finalize `.wav` in `finally` (valid header even on crash).
- One session at a time; concurrent connections each get a timestamped `.wav`.

## 7. Testing — Two Tiers

### Tier 1 — Programmatic (authored, run, and verified by Claude; no human ears)

**Unit checks (fast, deviceless):**
- `commonMain`: `StreamConfig` JSON handshake round-trips (contract intact).
- Python: feed a synthetic sine `ByteArray` through the frame handler → assert output `.wav` has correct header (rate/channels/16-bit) and sample count.

**Closed-loop acoustic e2e (the real proof), one orchestration harness:**
1. Start `server.py` (writes `captured.wav`).
2. Trigger app headlessly:
   ```bash
   adb shell am start -W -n com.example.audiostreampoc/.MainActivity \
     --es host <mac-ip> --ei port 8765 --ez autostart true --ei durationMs 8000
   ```
   App auto-records 8 s, then stops and closes the socket. `-W` avoids a launch/extra-read race.
3. **Simultaneously** play `reference.wav` out the Mac speakers via `sounddevice`. Reference is a **frequency sweep (chirp)** — robust for cross-correlation alignment and spans the spectrum for a spectral check.
4. Phone mic captures → streams → `captured.wav`.
5. `analyze.py` (`soundfile` + `scipy.signal`) compares `reference.wav` vs `captured.wav` and asserts:
   - **Not silent** — RMS above noise floor (dead-pipeline guard).
   - **Duration/sample-count** within tolerance (dropped/truncated-frame guard).
   - **Cross-correlation peak** above threshold with stable lag (proves captured audio *is* the reference content, not garbage).
   - **RMS delta** within band + **spectral correlation** above threshold.
6. Harness prints a metrics table and **PASS/FAIL**.

**Acoustic-loopback caveat (deliberate):** speaker → room → mic, so thresholds are lenient and calibrated on a first baseline run. This proves the **pipeline faithfully carries real mic audio**, not bit-exactness — which is the correct thing to prove. A bit-exact digital loopback would bypass the mic and defeat the PoC's purpose.

### Tier 2 — Manual (user, only after Tier 1 is green)

User listens to live playback while speaking, and replays `captured.wav`, to sign off by ear.

### One-time setup required from user

- Phone connected via `adb` (USB or wifi); `RECORD_AUDIO` granted (`adb shell pm grant ...` is fine).
- Mac and phone on the same network.
- Mac volume up, phone positioned near the speakers for the acoustic test.

## 8. Key Implementation Pitfalls (carry into the plan)

1. **AGP 9 + KMP:** `com.android.library` is unusable with KMP under AGP 9 — we stay on AGP 8.13.2 to avoid this.
2. **Ktor binary frames:** `send(byteArray)` does not exist; use `send(Frame.Binary(fin = true, data = byteArray))`.
3. **AudioRecord 16 kHz:** works universally in practice but only 44100 Hz is formally guaranteed — guard on `getMinBufferSize`, fall back to 44.1 kHz.
4. **ADB `-W` flag:** required in the harness to avoid a launch vs intent-extra-read race.
5. **Audio scale mismatch:** normalize all signals to float32 `[-1, 1]` before any cross-library RMS/correlation.
6. **`AudioRecord` ordering:** always `stop()` before `release()`.

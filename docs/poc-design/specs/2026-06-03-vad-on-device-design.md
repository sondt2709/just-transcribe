# On-Device VAD (Voice Activity Detection) — Design

**Date:** 2026-06-03
**Status:** Approved (design phase)
**Builds on:** [2026-06-01 KMP Audio Streaming PoC](2026-06-01-kmp-audio-streaming-poc-design.md)

## 1. Purpose & Scope

Add **on-device voice activity detection** to the audio-streaming PoC. While streaming, the
phone detects whether the current audio contains speech and:

1. **Lights an icon** on the phone (the primary ask — "let me know when VAD fires").
2. **Gates the stream** — only sends audio over the WebSocket while speech is present.

This previews the production architecture: a cheap, always-on CPU VAD that gates an expensive
model. When ASR/translation land later, the VAD keeps the power-hungry model asleep until
there's speech.

### Success criterion

While streaming from the phone: speaking turns the on-screen indicator **green within ~100 ms**
and resumes sending audio; going quiet returns it to **gray** after a short hangover and pauses
sending. The resulting `captured.wav` on the Mac contains the spoken audio with silences
trimmed, with no clipped word onsets and no mid-word dropouts.

### Out of scope (YAGNI)

ASR/transcription, translation, NPU/GPU acceleration (unnecessary for a ~2 MB model — see §8),
server-side VAD, iOS, tuning UI beyond a single gating toggle, persisting/segmenting speech
timestamps.

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Where VAD runs | **On-device (phone), CPU** | Matches the "native Android" goal; the right place to learn the on-device path. |
| Behaviour | **Indicator + gate streaming** | Lights the icon *and* only streams during speech. |
| Model / library | **Silero VAD via `gkonovalov/android-vad:silero` 2.0.10** (MIT, JitPack) | Community-favoured, accurate in noise, MIT; the library handles PCM16→float, framing, model loading. |
| Acceleration | **CPU only (no NNAPI/GPU/NPU)** | For a ~2 MB / 260K-param model running 32 ms frames in <1 ms, accelerator dispatch + copy overhead makes CPU the correct *and* faster choice. NNAPI is deprecated (Android 15). No thermal concern. |
| Detector seam | **commonMain `interface VoiceActivityDetector` + androidMain impl, injected** | Silero needs a `Context` (awkward via `expect/actual`); an interface enables fake-injection in unit tests. Still swappable (WebRTC / hand-rolled v6 / iOS) later. |
| Hysteresis location | **Pure-Kotlin `SpeechGate` in commonMain** (library durations set to 0) | All onset/hangover/pre-roll logic is deviceless-testable; the library returns the raw per-frame decision only. |
| Gating vs the e2e test | **VAD off on the autostart/automation path** (`--ez vad`, default `false`) | The Tier-1 harness plays a *chirp* (not speech); gating would suppress it. Keeping VAD off there leaves the proven transport test byte-for-byte unchanged. |
| Server | **No changes** | It writes whatever frames arrive; under gating `captured.wav` simply has silences trimmed. |

## 3. Architecture

One VAD stage sits between capture and transport. It observes the **single** cold mic flow
(collecting it twice would start a second `AudioRecord`) and produces two outputs: a speech-state
signal for the icon and a gated audio flow for the streamer.

```
AudioCapture.pcmFrames()  ──►  VadGate  ──► gated Flow<ByteArray> ──► AudioStreamer ──► WS
   (1600-sample / 100ms chunks)   │
                                  └──► speechState: StateFlow<Boolean> ──► MainActivity icon
```

Four single-purpose units — three pure Kotlin in `commonMain` (deviceless-testable), one
platform wrapper in `androidMain`:

| Unit | Location | Responsibility |
|---|---|---|
| `VoiceActivityDetector` (interface) | commonMain | "Is this one 1024-byte Silero frame speech?" → `Boolean`; `close()`. |
| `AndroidVoiceActivityDetector` | androidMain | Implements the interface over android-vad `VadSilero` (durations = 0 → raw per-frame). |
| `PcmFramer` | commonMain (pure) | Reframes arbitrary ~100 ms chunks into fixed **1024-byte** (512-sample) frames, carrying the remainder across chunks. |
| `SpeechGate` | commonMain (pure) | State machine: per-chunk speech booleans → stable speaking state with onset + hangover hysteresis; emits per-chunk forward/onset decisions. |
| `VadGate` | commonMain | Orchestrates framer → detector → gate over the capture flow; owns the pre-roll ring buffer; exposes `speechState`; emits gated chunks. |

This mirrors the project's existing seam pattern (`AudioCapture`, `HttpClientFactory`) so `shared`
stays liftable and an `iosMain` detector can implement the same interface later.

## 4. Data flow & gating logic

Per ~100 ms chunk (3200 bytes = 1600 samples): `PcmFramer` yields **3 frames of 1024 bytes**
(512 samples) + a 128-byte remainder carried forward. Each frame runs through the detector
(<1 ms). The chunk counts as speech if **any** frame is speech. `SpeechGate` applies hysteresis:

- **Onset** — the first speech chunk flips to *speaking* and signals a pre-roll flush so the
  word onset isn't clipped.
- **Hangover** — once speaking, stay speaking until **`hangoverChunks`** consecutive silent
  chunks (default 4 ≈ 400 ms), then flip to *silent*. Trims trailing silence and kills flicker.
- **Gate** — forward a chunk only while *speaking*. On onset, first flush the buffered pre-roll
  (`preRollChunks`, default 1 ≈ 100 ms). The same `speaking` flag drives the icon via
  `speechState`.

`VadConfig(preRollChunks = 1, hangoverChunks = 4)` holds the tunable defaults. The detector is
constructed fresh per streaming session (clean Silero state) and `close()`d in `finally`.

When **gating is disabled** (a manual checkbox, default on), `VadGate` still computes
`speechState` (so the icon works) but forwards every chunk — useful for A/B-ing raw vs gated
audio by ear.

## 5. Component changes

- **`AudioStreamer`** — change `stream(host, port, capture)` to `stream(host, port, sampleRate,
  frames: Flow<ByteArray>)` so it's a pure transport pumping whatever flow it's handed (raw or
  gated). The single call site (`MainActivity`) builds the flow.
- **`MainActivity`** — add a `TextView` indicator (green ● "speech" / gray ○ "silence") and a
  `CheckBox` "VAD gating" (checked) to the existing `LinearLayout`. Read a `vad` boolean intent
  extra (default `false`) for the autostart path. While streaming with VAD enabled, build the
  detector + `VadGate`, wire `speechState` → indicator, and pass the (gated) flow to the
  streamer. Guard: only enable VAD when `capture.sampleRate == 16000` (Silero supports 8/16 kHz;
  the 44.1 kHz fallback path streams raw).
- **Server / Python** — unchanged.

## 6. Testing — two tiers (matches the project)

### Tier 1 — programmatic, deviceless (authored, run, verified by Claude)

- `commonTest` unit tests for **`PcmFramer`** (3200→3×1024 + 128 remainder; partial/empty
  inputs; byte order preserved across boundaries) and **`SpeechGate`** (synthetic boolean
  sequences → onset / hangover / counter-reset / re-onset).
- **`VadGate`** tested with a **`FakeVoiceActivityDetector`** + `runTest`: passthrough when
  gating off, all-silence emits nothing, onset flushes pre-roll and hangover keeps trailing
  silence, `speechState` flips true on speech.
- The existing Python unit tests and the **chirp acoustic e2e (VAD off)** stay green — regression
  guard on the proven transport.

### Tier 2 — manual, the user's sensory sign-off (after Tier 1 is green)

- Build/install; tap Start; speak → indicator green within ~100 ms; stop → gray after ~400 ms.
- `captured.wav` holds the speech with silences trimmed; no onset clipping; no mid-word dropouts.
- Re-run the chirp e2e → still **E2E PASS** (regression).
- App stable for a minute on the OnePlus CPH2449 (watch for the known ONNX native-crash report).

## 7. Risks & pitfalls (carried into the plan)

| Risk | Mitigation |
|---|---|
| Gating would break the chirp e2e | VAD off on the autostart path (`vad` extra, default false) |
| Word-onset clipping | Pre-roll ring buffer (default 1 chunk) |
| Icon/gate flicker | Hangover (default 4 chunks ≈ 400 ms) |
| Device-specific ONNX native crash (lib issue #39) | Pin lib 2.0.10; verify on the OnePlus |
| R8/ProGuard strips ONNX in release | PoC builds **debug** (minify off) — documented; add `-keep class ai.onnxruntime.** { *; }` if a release build is ever needed |
| Silero is stateful | Construct a fresh detector per session; `close()` in `finally` |
| Cold mic flow collected twice → 2nd `AudioRecord` | `VadGate` decorates (single collect), never re-collects |
| Frame remainder dropped across chunks | `PcmFramer` carries leftover bytes |
| Sample-rate fallback (44.1 kHz) | VAD only enabled at 16 kHz; otherwise stream raw |

## 8. Forward path (noted, not built)

The "cheap CPU VAD gates the stream" shape is the stepping stone to: **VAD gate → on-device ASR
(Whisper on the Qualcomm NPU via QNN / Qualcomm AI Hub) → translation.** *That* phase is where
NPU offload and thermal management matter — expect throttling on long sessions, target a
quantized + static-shape model, and design for bursty rather than continuous transcription. The
VAD built here is exactly what keeps that model asleep until there's speech.

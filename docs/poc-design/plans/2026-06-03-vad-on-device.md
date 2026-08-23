# On-Device VAD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect speech on-device while streaming, light an icon on the phone, and gate the WebSocket stream so audio is only sent during speech.

**Architecture:** A `VadGate` stage decorates the existing single cold mic `Flow<ByteArray>`. It slices ~100 ms chunks into fixed 1024-byte Silero frames (`PcmFramer`), runs each frame through a `VoiceActivityDetector` (Silero via `gkonovalov/android-vad`), applies onset/hangover/pre-roll hysteresis in a pure `SpeechGate`, exposes a `speechState: StateFlow<Boolean>` for the UI icon, and emits only the chunks to forward. All decision logic is pure Kotlin in `commonMain` (deviceless unit tests); only the model wrapper is Android code. VAD stays **off** on the autostart path so the existing chirp e2e is unchanged.

**Tech Stack:** Kotlin Multiplatform (Kotlin 2.3.21, AGP 8.13.2, JDK 17), Ktor 3.5.0 WebSockets, kotlinx.coroutines Flow/StateFlow, `gkonovalov/android-vad:silero:2.0.10` (Silero VAD on ONNX Runtime, CPU), `kotlinx-coroutines-test`.

**Reference design:** `docs/superpowers/specs/2026-06-03-vad-on-device-design.md`

---

## File structure

**Create (commonMain — pure, testable):**
- `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VadConfig.kt` — tunable defaults.
- `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VoiceActivityDetector.kt` — interface seam.
- `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/PcmFramer.kt` — chunk→fixed-frame reassembly.
- `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/SpeechGate.kt` — hysteresis state machine.
- `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VadGate.kt` — flow orchestrator.

**Create (androidMain — platform):**
- `kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/AndroidVoiceActivityDetector.kt` — Silero wrapper.

**Create (commonTest):**
- `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/PcmFramerTest.kt`
- `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/SpeechGateTest.kt`
- `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/VadGateTest.kt` (contains a `FakeVoiceActivityDetector`)

**Modify:**
- `kmp/settings.gradle.kts` — add the JitPack repository.
- `kmp/gradle/libs.versions.toml` — add `android-vad-silero` + `kotlinx-coroutines-test`.
- `kmp/shared/build.gradle.kts` — add androidMain + commonTest deps.
- `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioStreamer.kt` — accept a `Flow<ByteArray>` + `sampleRate`.
- `kmp/androidApp/src/main/kotlin/com/example/audiostreampoc/MainActivity.kt` — icon, gating checkbox, `vad` intent extra, pipeline wiring.
- `README.md` — document the VAD feature (Task 8).

**Conventions to match:** package `com.example.audiostreampoc` everywhere; tests use `kotlin.test` (`@Test`, `assertEquals`, …) like `StreamConfigTest.kt`; 4-space indent; concise KDoc on public types.

---

## Task 1: Dependencies & build wiring

**Files:**
- Modify: `kmp/settings.gradle.kts`
- Modify: `kmp/gradle/libs.versions.toml`
- Modify: `kmp/shared/build.gradle.kts`

- [ ] **Step 1: Add the JitPack repository**

`gkonovalov/android-vad` is published on JitPack. `settings.gradle.kts` uses
`FAIL_ON_PROJECT_REPOS`, so the repo must be declared here. Edit the
`dependencyResolutionManagement { repositories { … } }` block in `kmp/settings.gradle.kts` to:

```kotlin
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
```

- [ ] **Step 2: Add version catalog entries**

In `kmp/gradle/libs.versions.toml`, add to `[versions]`:

```toml
androidVad = "2.0.10"
```

Add to `[libraries]`:

```toml
android-vad-silero = { module = "com.github.gkonovalov.android-vad:silero", version.ref = "androidVad" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
```

(`coroutines` version `1.9.0` already exists in `[versions]`; reuse it for the test artifact.)

- [ ] **Step 3: Wire the deps into the shared module**

In `kmp/shared/build.gradle.kts`, add the test dependency to `commonTest` and the library to
`androidMain`:

```kotlin
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
            implementation(libs.android.vad.silero)
        }
```

- [ ] **Step 4: Verify the new dependency resolves and the existing tests still pass**

Run: `cd kmp && ./gradlew :shared:assembleDebug`
Expected: `BUILD SUCCESSFUL` (this resolves `com.github.gkonovalov.android-vad:silero:2.0.10`
from JitPack — the first fetch may take a minute).

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest`
Expected: `BUILD SUCCESSFUL`, the existing `StreamConfigTest` (2 tests) still passes — confirms
`kotlinx-coroutines-test` resolved.

- [ ] **Step 5: Commit**

```bash
git add kmp/settings.gradle.kts kmp/gradle/libs.versions.toml kmp/shared/build.gradle.kts
git commit -m "build(kmp): add android-vad Silero + coroutines-test deps

Constraint: settings.gradle.kts uses FAIL_ON_PROJECT_REPOS, so JitPack must be
declared centrally in dependencyResolutionManagement.
Confidence: high
Scope-risk: narrow"
```

---

## Task 2: PcmFramer — reassemble chunks into fixed Silero frames

Silero needs exactly 512-sample (1024-byte) frames; the mic emits ~3200-byte chunks. `PcmFramer`
buffers and slices, carrying the leftover across chunks so no samples are lost.

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/PcmFramer.kt`
- Test: `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/PcmFramerTest.kt`

- [ ] **Step 1: Write the failing test**

Create `PcmFramerTest.kt`:

```kotlin
package com.example.audiostreampoc

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PcmFramerTest {

    @Test
    fun slices_full_frames_and_keeps_remainder() {
        val framer = PcmFramer(frameBytes = 1024)
        // 3200 = 3 * 1024 + 128
        val frames = framer.frame(ByteArray(3200) { (it % 251).toByte() })
        assertEquals(3, frames.size)
        frames.forEach { assertEquals(1024, it.size) }
    }

    @Test
    fun carries_remainder_into_next_chunk() {
        val framer = PcmFramer(frameBytes = 1024)
        framer.frame(ByteArray(3200))               // leftover 128
        // 128 + 3200 = 3328 -> 3 frames (3072), leftover 256
        assertEquals(3, framer.frame(ByteArray(3200)).size)
    }

    @Test
    fun returns_no_frames_until_a_full_frame_is_buffered() {
        val framer = PcmFramer(frameBytes = 1024)
        assertTrue(framer.frame(ByteArray(500)).isEmpty())
        assertTrue(framer.frame(ByteArray(500)).isEmpty()) // 1000 < 1024
        assertEquals(1, framer.frame(ByteArray(100)).size) // 1100 -> 1 frame, leftover 76
    }

    @Test
    fun preserves_byte_order_across_boundaries() {
        val framer = PcmFramer(frameBytes = 4)
        val out = framer.frame(byteArrayOf(1, 2, 3, 4, 5, 6)) // frame [1,2,3,4], leftover [5,6]
        assertEquals(1, out.size)
        assertEquals(listOf<Byte>(1, 2, 3, 4), out[0].toList())
        val out2 = framer.frame(byteArrayOf(7, 8))            // [5,6,7,8] -> 1 frame
        assertEquals(listOf<Byte>(5, 6, 7, 8), out2[0].toList())
    }

    @Test
    fun empty_chunk_yields_no_frames() {
        val framer = PcmFramer(frameBytes = 4)
        assertTrue(framer.frame(ByteArray(0)).isEmpty())
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "*PcmFramerTest*"`
Expected: FAIL — compilation error, `PcmFramer` is unresolved.

- [ ] **Step 3: Write the minimal implementation**

Create `PcmFramer.kt`:

```kotlin
package com.example.audiostreampoc

/**
 * Reassembles a stream of arbitrary-length 16-bit PCM byte chunks into fixed-size
 * frames of [frameBytes] bytes. Bytes that don't fill a frame are retained and
 * prepended to the next chunk, so no samples are lost across chunk boundaries.
 *
 * Not thread-safe; drive it from a single coroutine.
 */
class PcmFramer(private val frameBytes: Int) {
    private var leftover = ByteArray(0)

    /** Append [chunk] and return every complete [frameBytes]-sized frame now available. */
    fun frame(chunk: ByteArray): List<ByteArray> {
        val data = leftover + chunk
        val frames = ArrayList<ByteArray>(data.size / frameBytes)
        var offset = 0
        while (data.size - offset >= frameBytes) {
            frames.add(data.copyOfRange(offset, offset + frameBytes))
            offset += frameBytes
        }
        leftover = data.copyOfRange(offset, data.size)
        return frames
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "*PcmFramerTest*"`
Expected: `BUILD SUCCESSFUL`, 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/PcmFramer.kt \
        kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/PcmFramerTest.kt
git commit -m "feat(vad): add PcmFramer to reassemble PCM into 1024-byte Silero frames

Confidence: high
Scope-risk: narrow"
```

---

## Task 3: SpeechGate — onset/hangover hysteresis

Pure state machine: one boolean per chunk (`true` = chunk contained speech) in, a per-chunk
`Decision` out. Default tuning lives in `VadConfig` (created in Task 4); here `hangoverChunks` is
a constructor arg so the machine is self-contained.

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/SpeechGate.kt`
- Test: `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/SpeechGateTest.kt`

- [ ] **Step 1: Write the failing test**

Create `SpeechGateTest.kt`:

```kotlin
package com.example.audiostreampoc

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SpeechGateTest {

    @Test
    fun silence_before_any_speech_is_not_forwarded() {
        val gate = SpeechGate(hangoverChunks = 4)
        val d = gate.process(chunkHasSpeech = false)
        assertFalse(d.isSpeaking)
        assertFalse(d.forward)
        assertFalse(d.onset)
    }

    @Test
    fun first_speech_chunk_is_an_onset_and_is_forwarded() {
        val gate = SpeechGate(hangoverChunks = 4)
        val d = gate.process(true)
        assertTrue(d.isSpeaking)
        assertTrue(d.onset)
        assertTrue(d.forward)
    }

    @Test
    fun continued_speech_is_forwarded_without_onset() {
        val gate = SpeechGate(hangoverChunks = 4)
        gate.process(true)
        val d = gate.process(true)
        assertTrue(d.isSpeaking)
        assertFalse(d.onset)
        assertTrue(d.forward)
    }

    @Test
    fun trailing_silence_within_hangover_keeps_forwarding() {
        val gate = SpeechGate(hangoverChunks = 4)
        gate.process(true)
        repeat(3) {
            val d = gate.process(false)
            assertTrue(d.isSpeaking)
            assertTrue(d.forward)
        }
    }

    @Test
    fun silence_beyond_hangover_releases_and_stops_forwarding() {
        val gate = SpeechGate(hangoverChunks = 4)
        gate.process(true)
        repeat(3) { gate.process(false) } // within hangover
        val d = gate.process(false)       // 4th silent chunk -> release
        assertFalse(d.isSpeaking)
        assertFalse(d.forward)
    }

    @Test
    fun speech_resets_the_hangover_counter() {
        val gate = SpeechGate(hangoverChunks = 4)
        gate.process(true)
        gate.process(false)
        gate.process(false)
        gate.process(true)                                   // resets the silent run
        repeat(3) { assertTrue(gate.process(false).isSpeaking) }
        assertFalse(gate.process(false).isSpeaking)          // now releases
    }

    @Test
    fun new_speech_after_release_is_a_fresh_onset() {
        val gate = SpeechGate(hangoverChunks = 2)
        gate.process(true)
        gate.process(false)
        gate.process(false) // release (hangover = 2)
        assertTrue(gate.process(true).onset)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "*SpeechGateTest*"`
Expected: FAIL — compilation error, `SpeechGate` is unresolved.

- [ ] **Step 3: Write the minimal implementation**

Create `SpeechGate.kt`:

```kotlin
package com.example.audiostreampoc

/**
 * Pure hysteresis state machine for VAD gating. Fed one boolean per audio chunk
 * (true = the chunk contained speech), it tracks a stable "speaking" state and
 * decides which chunks to forward downstream.
 *
 * - Onset: the first speech chunk transitions to speaking and sets [Decision.onset]
 *   so the caller can flush a pre-roll before forwarding (avoids clipping word onsets).
 * - Hangover: once speaking, stay speaking until [hangoverChunks] consecutive silent
 *   chunks pass, then transition to silent. Trims trailing silence and prevents flicker.
 *
 * Not thread-safe; drive from a single coroutine.
 */
class SpeechGate(private val hangoverChunks: Int) {

    var isSpeaking: Boolean = false
        private set

    private var silentRun = 0

    /**
     * @property isSpeaking gate state after processing this chunk (drives the icon).
     * @property onset true only on the silent→speaking transition (flush pre-roll).
     * @property forward true if this chunk should be sent downstream.
     */
    data class Decision(
        val isSpeaking: Boolean,
        val onset: Boolean,
        val forward: Boolean,
    )

    fun process(chunkHasSpeech: Boolean): Decision {
        if (chunkHasSpeech) {
            val onset = !isSpeaking
            isSpeaking = true
            silentRun = 0
            return Decision(isSpeaking = true, onset = onset, forward = true)
        }
        if (isSpeaking) {
            silentRun++
            if (silentRun >= hangoverChunks) {
                isSpeaking = false
                silentRun = 0
                return Decision(isSpeaking = false, onset = false, forward = false)
            }
            return Decision(isSpeaking = true, onset = false, forward = true)
        }
        return Decision(isSpeaking = false, onset = false, forward = false)
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "*SpeechGateTest*"`
Expected: `BUILD SUCCESSFUL`, 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/SpeechGate.kt \
        kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/SpeechGateTest.kt
git commit -m "feat(vad): add SpeechGate onset/hangover hysteresis state machine

Confidence: high
Scope-risk: narrow"
```

---

## Task 4: VoiceActivityDetector interface + VadConfig

Pure declarations — the detector seam and tuning struct. No behaviour to test; verified by
compilation (and exercised by Task 5's tests).

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VoiceActivityDetector.kt`
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VadConfig.kt`

- [ ] **Step 1: Create the interface**

Create `VoiceActivityDetector.kt`:

```kotlin
package com.example.audiostreampoc

/**
 * Per-frame speech detector seam. Implementations operate on exactly one Silero
 * frame of 16-bit mono PCM (512 samples = 1024 bytes at 16 kHz). Stateful across
 * calls, so a single instance must process frames of one stream in order; create a
 * fresh instance per streaming session and [close] it when done.
 *
 * An interface (rather than expect/actual) because the Android implementation needs
 * a platform Context, and so unit tests can inject a fake.
 */
interface VoiceActivityDetector {
    /** True if this single 1024-byte frame is classified as speech. */
    fun isSpeech(frame: ByteArray): Boolean

    /** Release any native resources held by the detector. */
    fun close()
}
```

- [ ] **Step 2: Create the config**

Create `VadConfig.kt`:

```kotlin
package com.example.audiostreampoc

/**
 * Tunable parameters for the VAD stage. Defaults are sized for the PoC's ~100 ms
 * capture chunks at 16 kHz.
 *
 * @property preRollChunks chunks of audio replayed at speech onset so word onsets
 *   aren't clipped (1 ≈ 100 ms).
 * @property hangoverChunks consecutive silent chunks tolerated before declaring
 *   silence, trimming trailing silence without clipping word endings (4 ≈ 400 ms).
 */
data class VadConfig(
    val preRollChunks: Int = 1,
    val hangoverChunks: Int = 4,
)
```

- [ ] **Step 3: Verify it compiles**

Run: `cd kmp && ./gradlew :shared:compileDebugKotlinAndroid`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VoiceActivityDetector.kt \
        kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VadConfig.kt
git commit -m "feat(vad): add VoiceActivityDetector seam + VadConfig defaults

Rejected: expect/actual detector | Silero needs a Context and fakes are needed for tests
Confidence: high
Scope-risk: narrow"
```

---

## Task 5: VadGate — flow orchestrator with pre-roll

Ties framer + detector + gate over the capture flow, owns the pre-roll ring buffer, exposes
`speechState`, and emits gated chunks. Tested with a `FakeVoiceActivityDetector`.

**Files:**
- Create: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VadGate.kt`
- Test: `kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/VadGateTest.kt`

- [ ] **Step 1: Write the failing test**

Create `VadGateTest.kt`. The fake keys speech off the first byte, and `frameBytes = 2` makes each
2-byte chunk exactly one frame, so chunk→frame mapping is 1:1 and sequences stay readable:

```kotlin
package com.example.audiostreampoc

import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private class FakeVoiceActivityDetector : VoiceActivityDetector {
    var closed = false
        private set
    override fun isSpeech(frame: ByteArray): Boolean = frame.isNotEmpty() && frame[0].toInt() != 0
    override fun close() { closed = true }
}

class VadGateTest {

    private val silence = byteArrayOf(0, 0)
    private val speech = byteArrayOf(1, 0)

    private fun newGate() = VadGate(
        detector = FakeVoiceActivityDetector(),
        config = VadConfig(preRollChunks = 1, hangoverChunks = 4),
        frameBytes = 2,
    )

    @Test
    fun passthrough_when_gating_disabled_emits_every_chunk() = runTest {
        val out = newGate().gate(flowOf(silence, speech, silence), gatingEnabled = false).toList()
        assertEquals(3, out.size)
    }

    @Test
    fun all_silence_emits_nothing_when_gating_enabled() = runTest {
        val out = newGate().gate(flowOf(silence, silence, silence), gatingEnabled = true).toList()
        assertTrue(out.isEmpty())
    }

    @Test
    fun onset_flushes_preroll_and_hangover_keeps_trailing_silence() = runTest {
        // s s | SPEECH SPEECH | s s s s(release)
        val input = flowOf(silence, silence, speech, speech, silence, silence, silence, silence)
        val out = newGate().gate(input, gatingEnabled = true).toList()
        // pre-roll(1) + 2 speech + 3 trailing silence (within hangover) = 6; 4th silent releases
        assertEquals(6, out.size)
    }

    @Test
    fun speech_state_flips_true_on_speech() = runTest {
        val gate = newGate()
        assertFalse(gate.speechState.value)
        gate.gate(flowOf(speech), gatingEnabled = true).toList()
        assertTrue(gate.speechState.value)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "*VadGateTest*"`
Expected: FAIL — compilation error, `VadGate` is unresolved.

- [ ] **Step 3: Write the minimal implementation**

Create `VadGate.kt`:

```kotlin
package com.example.audiostreampoc

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow

/**
 * VAD stage that decorates the raw PCM capture flow. For each ~100 ms chunk it:
 *  1. slices the chunk into fixed [frameBytes]-byte Silero frames (PcmFramer),
 *  2. runs each frame through [detector]; the chunk is speech if any frame is,
 *  3. updates [speechState] (drives the UI icon),
 *  4. when [gatingEnabled], forwards only the chunks SpeechGate accepts, flushing a
 *     short pre-roll on onset; when gating is off it forwards every chunk but still
 *     updates [speechState].
 *
 * The mic flow is COLD and must be collected exactly once (a second collector would
 * start a second AudioRecord). This decorator collects its input once and re-emits,
 * so callers pass the result straight to AudioStreamer.
 *
 * @param frameBytes Silero frame size in bytes (512 samples * 2 bytes = 1024 at 16 kHz).
 */
class VadGate(
    private val detector: VoiceActivityDetector,
    config: VadConfig = VadConfig(),
    private val frameBytes: Int = 1024,
) {
    private val framer = PcmFramer(frameBytes)
    private val gate = SpeechGate(hangoverChunks = config.hangoverChunks)
    private val preRollCapacity = config.preRollChunks
    private val preRoll = ArrayDeque<ByteArray>(preRollCapacity + 1)

    private val _speechState = MutableStateFlow(false)
    val speechState: StateFlow<Boolean> = _speechState.asStateFlow()

    /** Decorate [input], updating [speechState] and (when [gatingEnabled]) gating output. */
    fun gate(input: Flow<ByteArray>, gatingEnabled: Boolean): Flow<ByteArray> = flow {
        input.collect { chunk ->
            val hasSpeech = framer.frame(chunk).any { detector.isSpeech(it) }
            val decision = gate.process(hasSpeech)
            _speechState.value = decision.isSpeaking

            if (!gatingEnabled) {
                emit(chunk)
                return@collect
            }

            if (decision.forward) {
                if (decision.onset) {
                    while (preRoll.isNotEmpty()) emit(preRoll.removeFirst())
                }
                emit(chunk)
            } else if (preRollCapacity > 0) {
                preRoll.addLast(chunk)
                while (preRoll.size > preRollCapacity) preRoll.removeFirst()
            }
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest --tests "*VadGateTest*"`
Expected: `BUILD SUCCESSFUL`, 4 tests pass.

- [ ] **Step 5: Run the full shared unit suite (regression)**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest`
Expected: `BUILD SUCCESSFUL` — `StreamConfigTest` (2) + `PcmFramerTest` (5) + `SpeechGateTest` (7)
+ `VadGateTest` (4) all pass.

- [ ] **Step 6: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/VadGate.kt \
        kmp/shared/src/commonTest/kotlin/com/example/audiostreampoc/VadGateTest.kt
git commit -m "feat(vad): add VadGate flow orchestrator with pre-roll + speechState

Directive: VadGate must collect the cold mic flow exactly once; never re-collect
pcmFrames() or a second AudioRecord starts.
Confidence: high
Scope-risk: narrow"
```

---

## Task 6: AndroidVoiceActivityDetector — Silero wrapper

The one platform unit. Wraps android-vad `VadSilero`, constructed with `silenceDurationMs = 0`
and `speechDurationMs = 0` so `isSpeech` returns the raw per-frame decision (all hysteresis lives
in `SpeechGate`). No deviceless unit test (needs the model + runtime); verified by compilation
and the Tier-2 manual check.

**Files:**
- Create: `kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/AndroidVoiceActivityDetector.kt`

- [ ] **Step 1: Create the wrapper**

Create `AndroidVoiceActivityDetector.kt`:

```kotlin
package com.example.audiostreampoc

import android.content.Context
import com.konovalov.vad.silero.VadSilero
import com.konovalov.vad.silero.config.FrameSize
import com.konovalov.vad.silero.config.Mode
import com.konovalov.vad.silero.config.SampleRate

/**
 * Silero VAD backed by gkonovalov/android-vad, running on the CPU (ONNX Runtime).
 *
 * Built with silenceDurationMs/speechDurationMs = 0 so [isSpeech] returns the raw
 * per-frame decision; onset/hangover/pre-roll hysteresis is owned by the pure-Kotlin
 * SpeechGate so it stays unit-testable. Only 16 kHz with a 512-sample (1024-byte)
 * frame is used — callers must not enable VAD when capture fell back to 44.1 kHz.
 *
 * Stateful: construct fresh per streaming session and [close] it when done.
 */
class AndroidVoiceActivityDetector(context: Context) : VoiceActivityDetector {

    private val vad = VadSilero(
        context.applicationContext,
        sampleRate = SampleRate.SAMPLE_RATE_16K,
        frameSize = FrameSize.FRAME_SIZE_512,
        mode = Mode.NORMAL,
        silenceDurationMs = 0,
        speechDurationMs = 0,
    )

    /** [frame] must be exactly 1024 bytes (512 samples, 16-bit mono). */
    override fun isSpeech(frame: ByteArray): Boolean = vad.isSpeech(frame)

    override fun close() = vad.close()
}
```

- [ ] **Step 2: Verify the shared module assembles with the Android implementation**

Run: `cd kmp && ./gradlew :shared:assembleDebug`
Expected: `BUILD SUCCESSFUL`. If the import paths fail to resolve, confirm the exact package of
`VadSilero`/`FrameSize`/`Mode`/`SampleRate` in the resolved
`com.github.gkonovalov.android-vad:silero:2.0.10` artifact (they are under
`com.konovalov.vad.silero` and `com.konovalov.vad.silero.config`) and adjust the imports.

- [ ] **Step 3: Commit**

```bash
git add kmp/shared/src/androidMain/kotlin/com/example/audiostreampoc/AndroidVoiceActivityDetector.kt
git commit -m "feat(vad): add Android Silero detector (CPU, raw per-frame)

Constraint: Silero supports only 8/16 kHz; this wrapper is 16 kHz / 512-frame only.
Rejected: NNAPI/GPU/NPU execution | dispatch+copy overhead makes CPU faster for a
~2 MB model, and NNAPI is deprecated (Android 15).
Directive: keep silenceDurationMs/speechDurationMs at 0 — hysteresis lives in SpeechGate.
Confidence: medium
Scope-risk: narrow
Not-tested: on-device isSpeech accuracy (covered by the Tier-2 manual check)"
```

---

## Task 7: Refactor AudioStreamer + wire the VAD pipeline into MainActivity

`AudioStreamer` becomes a pure transport over a `Flow<ByteArray>`; `MainActivity` builds the raw
or gated flow, drives the icon, and keeps VAD off on the autostart path. These change together so
the project compiles at the commit.

**Files:**
- Modify: `kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioStreamer.kt`
- Modify: `kmp/androidApp/src/main/kotlin/com/example/audiostreampoc/MainActivity.kt`

- [ ] **Step 1: Refactor AudioStreamer to pump a handed-in flow**

Replace the body of `AudioStreamer.kt` with:

```kotlin
package com.example.audiostreampoc

import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.HttpMethod
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json

/**
 * Opens a WebSocket to ws://host:port/stream, sends the JSON handshake as a text
 * frame, then streams PCM chunks from [frames] as binary frames until the flow
 * completes or the coroutine is cancelled. [frames] may be the raw capture flow or
 * a VAD-gated flow — AudioStreamer is a pure transport and doesn't care which.
 */
class AudioStreamer(private val client: HttpClient) {

    suspend fun stream(host: String, port: Int, sampleRate: Int, frames: Flow<ByteArray>) {
        val config = StreamConfig(sampleRate = sampleRate)
        client.webSocket(method = HttpMethod.Get, host = host, port = port, path = "/stream") {
            send(Frame.Text(Json.encodeToString(config)))
            try {
                frames.collect { chunk ->
                    send(Frame.Binary(fin = true, data = chunk))
                }
            } finally {
                // Ensure the server always sees a NORMAL close, even if collect
                // throws or a send fails mid-stream.
                close(CloseReason(CloseReason.Codes.NORMAL, "done"))
            }
        }
    }
}
```

- [ ] **Step 2: Rewrite MainActivity to add the icon, gating toggle, and VAD wiring**

Replace `MainActivity.kt` with the following. Changes vs. the original: adds a `speechIndicator`
`TextView` and a `gateCheckBox` `CheckBox` to the layout; reads a `vad` intent extra (default
`false`) for autostart; threads a `vadEnabled` flag through the permission flow; builds a raw or
VAD-gated flow and calls the new `AudioStreamer.stream` signature; updates the indicator from
`speechState`; constructs/`close()`s the detector per session.

```kotlin
package com.example.audiostreampoc

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private lateinit var hostField: EditText
    private lateinit var portField: EditText
    private lateinit var statusView: TextView
    private lateinit var toggleButton: Button
    private lateinit var gateCheckBox: CheckBox
    private lateinit var speechIndicator: TextView

    private val client by lazy { platformHttpClient() }
    private var streamJob: Job? = null

    // Pending auto-start params captured before permission resolves.
    private var pendingHost: String? = null
    private var pendingPort: Int = 8765
    private var pendingDurationMs: Long = 0L
    private var pendingVadEnabled: Boolean = false

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                val h = pendingHost ?: hostField.text.toString()
                startStreaming(h, pendingPort, pendingDurationMs, pendingVadEnabled)
            } else {
                setStatus("Microphone permission required")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        hostField = EditText(this).apply { hint = "Mac LAN IP (e.g. 192.168.1.50)" }
        portField = EditText(this).apply { setText("8765") }
        gateCheckBox = CheckBox(this).apply {
            text = "Gate stream on speech (VAD)"
            isChecked = true
        }
        speechIndicator = TextView(this).apply { text = "" }
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
            addView(gateCheckBox)
            addView(toggleButton)
            addView(speechIndicator)
            addView(statusView)
        })

        // Automation entry point: adb am start ... --es host --ei port --ez autostart
        //   --ei durationMs [--ez vad]. VAD defaults OFF here so the chirp e2e is unchanged.
        val autostart = intent.getBooleanExtra("autostart", false)
        if (autostart) {
            val host = intent.getStringExtra("host") ?: "127.0.0.1"
            val port = intent.getIntExtra("port", 8765)
            val durationMs = intent.getIntExtra("durationMs", 0).toLong()
            val vad = intent.getBooleanExtra("vad", false)
            hostField.setText(host)
            portField.setText(port.toString())
            requestThenStart(host, port, durationMs, vad)
        }
    }

    private fun onToggle() {
        if (streamJob?.isActive == true) {
            stopStreaming()
        } else {
            val host = hostField.text.toString()
            val port = portField.text.toString().toIntOrNull() ?: 8765
            // Manual Start always runs VAD (drives the icon); the checkbox controls gating.
            requestThenStart(host, port, durationMs = 0L, vadEnabled = true)
        }
    }

    private fun requestThenStart(host: String, port: Int, durationMs: Long, vadEnabled: Boolean) {
        pendingHost = host
        pendingPort = port
        pendingDurationMs = durationMs
        pendingVadEnabled = vadEnabled
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            startStreaming(host, port, durationMs, vadEnabled)
        } else {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun startStreaming(host: String, port: Int, durationMs: Long, vadEnabled: Boolean) {
        if (streamJob?.isActive == true) return
        toggleButton.text = "Stop"
        setStatus("Streaming to $host:$port")
        val gatingEnabled = gateCheckBox.isChecked
        streamJob = lifecycleScope.launch {
            val thisJob = coroutineContext[Job]
            val capture = AudioCapture()
            val streamer = AudioStreamer(client)
            // Silero supports only 8/16 kHz; skip VAD on the 44.1 kHz fallback.
            val useVad = vadEnabled && capture.sampleRate == 16000
            var detector: VoiceActivityDetector? = null
            var indicatorJob: Job? = null
            if (durationMs > 0) {
                launch {
                    delay(durationMs)
                    stopStreaming()
                }
            }
            try {
                // Build the (raw or VAD-gated) flow inside the try so a detector init
                // failure (e.g. the known ONNX crash on some devices) surfaces as a
                // status message instead of an uncaught crash.
                val frames: Flow<ByteArray> = if (useVad) {
                    val d = withContext(Dispatchers.Default) {
                        AndroidVoiceActivityDetector(this@MainActivity)
                    }
                    detector = d
                    val vadGate = VadGate(d)
                    indicatorJob = launch { vadGate.speechState.collect { setSpeechIndicator(it) } }
                    vadGate.gate(capture.pcmFrames(), gatingEnabled = gatingEnabled)
                } else {
                    capture.pcmFrames()
                }
                streamer.stream(host, port, capture.sampleRate, frames)
            } catch (e: Throwable) {
                setStatus("Connection failed: ${e.message}")
            } finally {
                // Cancel the icon collector first: StateFlow.collect never completes on
                // its own, so on the non-cancelled (e.g. connection-failure) exit path
                // the coroutine would otherwise hang awaiting this child. Then release
                // the native detector.
                indicatorJob?.cancel()
                detector?.close()
                // Only null the shared reference if it still points at THIS job, so a
                // quick Stop->Start cannot clobber a newly-launched job.
                if (streamJob === thisJob) streamJob = null
                onStreamEnded()
            }
        }
    }

    private fun stopStreaming() {
        // Cancel only — the coroutine's own finally block owns the null assignment,
        // preventing a Stop->Start race that would launch a second AudioRecord.
        streamJob?.cancel()
    }

    private fun onStreamEnded() {
        runOnUiThread {
            toggleButton.text = "Start"
            speechIndicator.text = ""
            if (statusView.text.toString().startsWith("Streaming")) setStatus("Idle")
        }
    }

    private fun setSpeechIndicator(speaking: Boolean) {
        runOnUiThread {
            speechIndicator.text = if (speaking) "● speech" else "○ silence"
            speechIndicator.setTextColor(if (speaking) Color.GREEN else Color.GRAY)
        }
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

- [ ] **Step 3: Build the whole app to verify both modules compile**

Run: `cd kmp && ./gradlew :androidApp:assembleDebug`
Expected: `BUILD SUCCESSFUL`. (Compiles `shared` + `androidApp`; confirms the new
`AudioStreamer.stream` signature, the VAD wiring, and the android-vad dependency all link.)

- [ ] **Step 4: Re-run the unit suite (regression — refactor didn't break common code)**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest`
Expected: `BUILD SUCCESSFUL`, all 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add kmp/shared/src/commonMain/kotlin/com/example/audiostreampoc/AudioStreamer.kt \
        kmp/androidApp/src/main/kotlin/com/example/audiostreampoc/MainActivity.kt
git commit -m "feat(vad): gate stream + speech icon on-device; VAD off on autostart

AudioStreamer becomes a pure transport over a handed-in Flow<ByteArray>; MainActivity
builds the raw or VAD-gated flow and drives a speech indicator.

Constraint: the chirp e2e plays non-speech, so autostart keeps VAD off (vad extra,
default false), leaving the proven transport test unchanged.
Constraint: VAD only enabled at 16 kHz (Silero limit); 44.1 kHz fallback streams raw.
Directive: detector is constructed per session and closed in finally (Silero is stateful).
Confidence: medium
Scope-risk: moderate
Not-tested: on-device gating/icon behaviour (covered by the Tier-2 manual check)"
```

---

## Task 8: Verification & docs

Confirm the whole suite is green, the existing e2e is untouched, document the feature, and hand
off the manual check.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full programmatic suite (Tier 1)**

Run: `cd kmp && ./gradlew :shared:testDebugUnitTest`
Expected: `BUILD SUCCESSFUL`, 18 tests (`StreamConfigTest` 2, `PcmFramerTest` 5, `SpeechGateTest`
7, `VadGateTest` 4).

Run: `cd kmp && ./gradlew :androidApp:assembleDebug`
Expected: `BUILD SUCCESSFUL`.

Run: `cd server && ./.venv/bin/python -m pytest -q`
Expected: the existing Python tests pass (server/analyzer unchanged).

- [ ] **Step 2: Document the feature in the README**

In `README.md`, add a short subsection under the wire-protocol/architecture area (after the
"Wire protocol" section) describing VAD. Insert:

```markdown
## On-device VAD (voice activity detection)

While streaming, the phone runs **Silero VAD** on-device (CPU, via
`gkonovalov/android-vad`) over the same PCM it captures. It does two things:

- **Speech icon** — a `● speech` (green) / `○ silence` (gray) indicator in the app
  reflects whether the current audio is speech.
- **Stream gating** — with the "Gate stream on speech (VAD)" checkbox on (default),
  audio is only sent over the WebSocket while speech is present, with a ~100 ms
  pre-roll on onset and a ~400 ms hangover so word edges aren't clipped. `captured.wav`
  therefore contains speech with silences trimmed.

VAD runs only at 16 kHz (Silero's supported rate) and is **off on the autostart path**
(`--ez vad true` to enable), so the chirp acoustic e2e exercises the raw transport
unchanged. All decision logic (`PcmFramer`, `SpeechGate`, `VadGate`) is pure Kotlin in
`shared/commonMain` with deviceless unit tests; only the Silero wrapper is Android code.

> NPU/GPU note: the VAD model is ~2 MB and runs a 32 ms frame in <1 ms on one CPU core,
> so it runs on the **CPU** — accelerator dispatch overhead would make NPU/GPU slower,
> and there's no thermal concern. The NPU/heat tradeoff becomes real later, for
> on-device ASR/translation.
```

Also append to the "Toolchain versions" line that the app now depends on
`gkonovalov/android-vad:silero 2.0.10` (Silero VAD, ONNX Runtime, CPU).

- [ ] **Step 3: Commit the docs**

```bash
git add README.md
git commit -m "docs: document on-device VAD (speech icon + stream gating)

Confidence: high
Scope-risk: narrow"
```

- [ ] **Step 4: Tier-2 manual check (hand off to the user)**

These require the physical OnePlus and the user's ears — present this checklist and let the user
run it (the user's sensory check is the final gate):

1. Install: `cd kmp && ./gradlew :androidApp:installDebug`.
2. Start the server: `cd server && ./.venv/bin/python server.py --host 0.0.0.0 --port 8765 --out captured-vad.wav`.
3. In the app: enter the Mac LAN IP + 8765, leave "Gate stream on speech (VAD)" checked, tap Start.
4. **Speak** → the indicator turns **green `● speech`** within ~100 ms; **stop** → returns to
   **gray `○ silence`** after ~400 ms.
5. Ctrl-C the server; `afplay server/captured-vad.wav` → your speech is present with silences
   trimmed; no clipped word onsets, no mid-word dropouts.
6. Optional A/B: uncheck the gating box, repeat → the icon still reacts but `captured.wav` keeps
   the silences (raw stream).
7. **Regression:** run the existing chirp e2e and confirm it still passes (VAD stays off there):
   `cd server && ./.venv/bin/python run_e2e.py --mac-ip "$(ipconfig getifaddr en0)" --port 8765 --duration 6`
   → **E2E PASS**.
8. Stability: keep streaming ~1 minute; confirm no native (ONNX) crash on the OnePlus.

---

## Self-review notes

- **Spec coverage:** §3 units → Tasks 2–6; §4 gating/pre-roll/hangover → Tasks 3 & 5; §5
  AudioStreamer/MainActivity/server-unchanged → Task 7 (server untouched by design); §6 Tier-1
  tests → Tasks 2/3/5/8, Tier-2 → Task 8 Step 4; §2 library/CPU/`vad`-off-on-autostart → Tasks 1,
  6, 7; §7 risks each map to a task note. §8 forward path → README note (Task 8 Step 2).
- **Type consistency:** `VoiceActivityDetector.isSpeech(ByteArray): Boolean` / `close()` used
  identically in Tasks 4, 5 (fake), 6, 7. `SpeechGate.Decision(isSpeaking, onset, forward)` used
  in Tasks 3 & 5. `VadGate(detector, config, frameBytes)` / `gate(input, gatingEnabled)` /
  `speechState` consistent in Tasks 5 & 7. `AudioStreamer.stream(host, port, sampleRate, frames)`
  consistent in Tasks 7 (both files). `VadConfig(preRollChunks, hangoverChunks)` consistent.
- **No placeholders:** every code/edit step shows complete content; commands have expected output.
```
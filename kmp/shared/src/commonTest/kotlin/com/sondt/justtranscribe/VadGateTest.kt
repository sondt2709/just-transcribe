package com.sondt.justtranscribe

import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

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

    @Test
    fun speech_state_returns_to_false_after_hangover() = runTest {
        val gate = newGate() // hangoverChunks = 4
        // speech, then 4 consecutive silent chunks -> releases on the 4th
        gate.gate(flowOf(speech, silence, silence, silence, silence), gatingEnabled = true).toList()
        assertFalse(gate.speechState.value)
    }
}

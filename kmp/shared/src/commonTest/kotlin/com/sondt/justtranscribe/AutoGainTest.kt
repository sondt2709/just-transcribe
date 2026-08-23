package com.sondt.justtranscribe

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AutoGainTest {
    @Test
    fun disabledReturnsInputUnchanged() {
        val input = floatArrayOf(0.01f, -0.02f, 0.005f)
        val gain = AutoGain(enabled = false)
        assertSame(input, gain.apply(input))
    }

    @Test
    fun enabledAmplifiesQuietAudioTowardTarget() {
        val input = FloatArray(512) { 0.01f }
        val gain = AutoGain(enabled = true)

        val out = gain.apply(input)

        var outMax = 0f
        for (s in out) if (abs(s) > outMax) outMax = abs(s)
        assertTrue(outMax > 0.01f, "expected amplification, got peak $outMax")
        assertTrue(gain.gain > 10.0f, "expected gain to rise from initial 10x")
    }

    @Test
    fun enabledSoftClipsToUnitRange() {
        val input = floatArrayOf(0.9f, -0.95f, 0.99f)
        val gain = AutoGain(enabled = true, initialGain = 40.0f)

        val out = gain.apply(input)

        for (s in out) assertTrue(abs(s) <= 1.0f, "sample $s exceeded unit range")
    }

    @Test
    fun resetRestoresInitialGain() {
        val gain = AutoGain(enabled = true, initialGain = 10.0f)
        gain.apply(FloatArray(512) { 0.01f })
        gain.reset()
        assertEquals(10.0f, gain.gain)
    }
}

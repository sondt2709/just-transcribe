package com.sondt.justtranscribe

import kotlin.test.Test
import kotlin.test.assertEquals

class WavEncoderTest {
    private fun ascii(b: ByteArray, off: Int, len: Int) =
        buildString { for (i in off until off + len) append(b[i].toInt().toChar()) }

    private fun le32(b: ByteArray, off: Int) =
        (b[off].toInt() and 0xFF) or
            ((b[off + 1].toInt() and 0xFF) shl 8) or
            ((b[off + 2].toInt() and 0xFF) shl 16) or
            ((b[off + 3].toInt() and 0xFF) shl 24)

    @Test
    fun headerAndSizeAreCorrect() {
        val samples = FloatArray(100) { 0f }
        val wav = WavEncoder.encode(samples, sampleRate = 16000)

        assertEquals(44 + 100 * 2, wav.size)
        assertEquals("RIFF", ascii(wav, 0, 4))
        assertEquals("WAVE", ascii(wav, 8, 4))
        assertEquals("fmt ", ascii(wav, 12, 4))
        assertEquals("data", ascii(wav, 36, 4))
        assertEquals(16000, le32(wav, 24))          // sample rate
        assertEquals(100 * 2, le32(wav, 40))         // data chunk size
        assertEquals(36 + 100 * 2, le32(wav, 4))     // RIFF chunk size
    }

    @Test
    fun encodesFullScaleSampleAsLittleEndianInt16() {
        val wav = WavEncoder.encode(floatArrayOf(1.0f))
        // Last 2 bytes = sample. 1.0 * 32767 = 32767 = 0x7FFF → 0xFF, 0x7F (LE).
        assertEquals(0xFF, wav[44].toInt() and 0xFF)
        assertEquals(0x7F, wav[45].toInt() and 0xFF)
    }
}

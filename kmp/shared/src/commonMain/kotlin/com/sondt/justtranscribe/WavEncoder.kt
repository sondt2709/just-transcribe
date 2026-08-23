package com.sondt.justtranscribe

/**
 * Encodes float32 mono PCM (range -1..1) into a little-endian 16-bit PCM WAV byte
 * array (44-byte RIFF header + data), ready to POST to the ASR endpoint. Ported
 * from the Flutter `wav_encoder`.
 */
object WavEncoder {
    fun encode(samples: FloatArray, sampleRate: Int = 16000): ByteArray {
        val dataSize = samples.size * 2
        val out = ByteArray(44 + dataSize)
        var p = 0
        fun ascii(s: String) { for (c in s) out[p++] = c.code.toByte() }
        fun le32(v: Int) {
            out[p++] = (v and 0xFF).toByte()
            out[p++] = ((v shr 8) and 0xFF).toByte()
            out[p++] = ((v shr 16) and 0xFF).toByte()
            out[p++] = ((v shr 24) and 0xFF).toByte()
        }
        fun le16(v: Int) {
            out[p++] = (v and 0xFF).toByte()
            out[p++] = ((v shr 8) and 0xFF).toByte()
        }
        ascii("RIFF"); le32(36 + dataSize); ascii("WAVE")
        ascii("fmt "); le32(16); le16(1); le16(1)         // PCM (1), mono (1)
        le32(sampleRate); le32(sampleRate * 2)            // byteRate = sampleRate * blockAlign
        le16(2); le16(16)                                 // blockAlign = 2, bitsPerSample = 16
        ascii("data"); le32(dataSize)
        for (s in samples) {
            val c = if (s > 1f) 1f else if (s < -1f) -1f else s
            val v = (c * 32767f).toInt()
            out[p++] = (v and 0xFF).toByte()
            out[p++] = ((v shr 8) and 0xFF).toByte()
        }
        return out
    }
}

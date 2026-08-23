package com.sondt.justtranscribe

/**
 * Reassembles a stream of arbitrary-length 16-bit PCM byte chunks into fixed-size
 * frames of [frameBytes] bytes. Bytes that don't fill a frame are retained and
 * prepended to the next chunk, so no samples are lost across chunk boundaries.
 *
 * Not thread-safe; drive it from a single coroutine.
 */
class PcmFramer(private val frameBytes: Int) {
    init { require(frameBytes > 0) { "frameBytes must be > 0, was $frameBytes" } }

    private var leftover = ByteArray(0)

    /** Append [chunk] and return every complete [frameBytes]-sized frame now available. */
    fun frame(chunk: ByteArray): List<ByteArray> {
        // ~3200 B at ~10 calls/s — array concat is fine here; revisit with a ring buffer if throughput grows.
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

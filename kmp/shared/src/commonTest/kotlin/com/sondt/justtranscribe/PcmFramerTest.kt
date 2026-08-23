package com.sondt.justtranscribe

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

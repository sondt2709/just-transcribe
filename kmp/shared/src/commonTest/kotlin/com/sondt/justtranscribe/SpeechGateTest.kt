package com.sondt.justtranscribe

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

    @Test
    fun zero_hangover_releases_on_first_silence() {
        val gate = SpeechGate(hangoverChunks = 0)
        gate.process(true)
        val d = gate.process(false)
        assertFalse(d.isSpeaking)
        assertFalse(d.forward)
    }
}

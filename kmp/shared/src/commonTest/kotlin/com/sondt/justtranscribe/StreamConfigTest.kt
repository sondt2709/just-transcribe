package com.sondt.justtranscribe

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class StreamConfigTest {
    @Test
    fun encodes_hello_handshake_with_expected_fields() {
        val json = Json.encodeToString(StreamConfig(sampleRate = 16000))
        // type defaults to "hello", channels=1, bitDepth=16
        assertEquals(
            """{"type":"hello","sampleRate":16000,"channels":1,"bitDepth":16}""",
            json,
        )
    }

    @Test
    fun round_trips_through_json() {
        val original = StreamConfig(sampleRate = 44100, channels = 1, bitDepth = 16)
        val decoded = Json.decodeFromString<StreamConfig>(Json.encodeToString(original))
        assertEquals(original, decoded)
    }
}

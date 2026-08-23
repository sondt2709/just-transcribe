package com.sondt.justtranscribe

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.Serializable

/** Wire-protocol handshake, mirrors the Python StreamConfig. Field ORDER and
 *  names must match the JSON the server expects: type, sampleRate, channels, bitDepth.
 *
 *  @EncodeDefault forces every field onto the wire even when it equals its default
 *  (kotlinx.serialization omits defaults otherwise), so the server always receives
 *  the complete handshake regardless of which Json instance encodes it. */
@Serializable
data class StreamConfig(
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val type: String = "hello",
    val sampleRate: Int,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val channels: Int = 1,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val bitDepth: Int = 16,
)

package com.sondt.justtranscribe

import kotlinx.serialization.Serializable

/**
 * A transcribed segment returned by ASR. Mirrors the Flutter `TranscriptSegment`:
 * an incrementing [id], the recognized [text], detected [lang] (short code), and
 * the [start]/[end] stream times of the source audio.
 */
@Serializable
data class TranscriptSegment(
    val id: Int,
    val text: String,
    val lang: String,
    val start: Double,
    val end: Double,
    val source: String = "mic",
    val speaker: String = "You",
)

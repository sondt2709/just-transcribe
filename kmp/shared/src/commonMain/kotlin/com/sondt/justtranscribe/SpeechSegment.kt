package com.sondt.justtranscribe

/**
 * A finalized speech utterance emitted by [Segmenter]: float PCM samples
 * (mono, the configured sample rate, range -1..1) plus its position in the stream.
 */
class SpeechSegment(
    val samples: FloatArray,
    val startTime: Double,
    val endTime: Double,
) {
    val duration: Double get() = endTime - startTime
}

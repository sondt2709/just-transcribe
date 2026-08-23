package com.sondt.justtranscribe

/**
 * Shared test double for [VoiceActivityDetector].
 *
 * - **Content mode** (no-arg): a frame is speech when its first byte is non-zero —
 *   used by `VadGateTest` with `silence = byteArrayOf(0,0)`, `speech = byteArrayOf(1,0)`.
 * - **Scripted mode** ([decisions] given): returns one decision per `isSpeech` call
 *   (one per frame), ignoring the bytes; past the end returns false — used by
 *   `SegmenterTest`.
 *
 * Records whether [close] was called.
 */
class FakeVoiceActivityDetector(private val decisions: List<Boolean>? = null) : VoiceActivityDetector {
    var closed = false
        private set
    private var index = 0

    override fun isSpeech(frame: ByteArray): Boolean =
        if (decisions != null) decisions.getOrElse(index++) { false }
        else frame.isNotEmpty() && frame[0].toInt() != 0

    override fun close() { closed = true }

    companion object {
        /** Scripted: [speech] true frames followed by [silence] false frames. */
        fun of(speech: Int, silence: Int): FakeVoiceActivityDetector =
            FakeVoiceActivityDetector(List(speech) { true } + List(silence) { false })
    }
}

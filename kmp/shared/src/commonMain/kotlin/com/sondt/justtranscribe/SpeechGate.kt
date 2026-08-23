package com.sondt.justtranscribe

/**
 * Pure hysteresis state machine for VAD gating. Fed one boolean per audio chunk
 * (true = the chunk contained speech), it tracks a stable "speaking" state and
 * decides which chunks to forward downstream.
 *
 * - Onset: the first speech chunk transitions to speaking and sets [Decision.onset]
 *   so the caller can flush a pre-roll before forwarding (avoids clipping word onsets).
 * - Hangover: once speaking, stay speaking until [hangoverChunks] consecutive silent
 *   chunks pass, then transition to silent. Trims trailing silence and prevents flicker.
 *
 * Not thread-safe; drive from a single coroutine.
 */
class SpeechGate(private val hangoverChunks: Int) {

    init { require(hangoverChunks >= 0) { "hangoverChunks must be >= 0, was $hangoverChunks" } }

    var isSpeaking: Boolean = false
        private set

    private var silentRun = 0

    /**
     * @property isSpeaking gate state after processing this chunk (drives the icon).
     * @property onset true only on the silent->speaking transition (flush pre-roll).
     * @property forward true if this chunk should be sent downstream.
     */
    data class Decision(
        val isSpeaking: Boolean,
        val onset: Boolean,
        val forward: Boolean,
    )

    fun process(chunkHasSpeech: Boolean): Decision {
        if (chunkHasSpeech) {
            val onset = !isSpeaking
            isSpeaking = true
            silentRun = 0
            return Decision(isSpeaking = true, onset = onset, forward = true)
        }
        if (isSpeaking) {
            silentRun++
            if (silentRun >= hangoverChunks) {
                isSpeaking = false
                silentRun = 0
                return Decision(isSpeaking = false, onset = false, forward = false)
            }
            return Decision(isSpeaking = true, onset = false, forward = true)
        }
        return Decision(isSpeaking = false, onset = false, forward = false)
    }
}

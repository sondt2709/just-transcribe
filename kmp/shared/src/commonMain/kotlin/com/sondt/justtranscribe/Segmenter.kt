package com.sondt.justtranscribe

/**
 * Tunable timing for [Segmenter]; defaults match the desktop Python pipeline
 * (`VAD_MIN_SPEECH_S = 0.25`, `VAD_MIN_SILENCE_S = 1.0`, `VAD_MAX_SPEECH_S = 15.0`).
 */
data class SegmenterConfig(
    val sampleRate: Int = 16000,
    val frameSamples: Int = 512,
    val minSpeechSec: Double = 0.25,
    val minSilenceSec: Double = 1.0,
    val maxSpeechSec: Double = 15.0,
)

/**
 * Turns a stream of float PCM into discrete [SpeechSegment]s using the per-frame
 * boolean decisions of [detector]. Same rules as the desktop pipeline:
 *
 *  - accumulate samples from speech onset (trailing silence is kept, as on desktop),
 *  - finalize a segment after [SegmenterConfig.minSilenceSec] of continuous silence,
 *  - discard a flushed segment shorter than [SegmenterConfig.minSpeechSec],
 *  - force-emit at [SegmenterConfig.maxSpeechSec].
 *
 * Works in float samples (what ASR/WAV need) and converts each 512-sample frame to
 * 16-bit PCM only to query the boolean [detector]. Does NOT own the detector's
 * lifecycle — the caller constructs/`close()`s it. Stateful: one per session;
 * [reset]/[flush] on stop.
 */
class Segmenter(
    private val detector: VoiceActivityDetector,
    private val config: SegmenterConfig = SegmenterConfig(),
) {
    private val frameSamples = config.frameSamples
    private val minSpeechSamples = (config.minSpeechSec * config.sampleRate).toInt()
    private val minSilenceSamples = (config.minSilenceSec * config.sampleRate).toInt()
    private val maxSpeechSamples = (config.maxSpeechSec * config.sampleRate).toInt()

    // Leftover float samples that didn't fill a frame, carried to the next process().
    private var carry = FloatArray(frameSamples)
    private var carryLen = 0
    private var processedSamples = 0L

    private var inSpeech = false
    private var speechStartSample = 0L
    private var silenceSamples = 0
    private var speech = FloatArray(frameSamples * 16)
    private var speechLen = 0

    /** Feed a chunk of float samples; returns any segments that completed within it. */
    fun process(samples: FloatArray): List<SpeechSegment> {
        val completed = ArrayList<SpeechSegment>()
        val working: FloatArray
        if (carryLen == 0) {
            working = samples
        } else {
            working = FloatArray(carryLen + samples.size)
            carry.copyInto(working, 0, 0, carryLen)
            samples.copyInto(working, carryLen)
        }
        var offset = 0
        while (working.size - offset >= frameSamples) {
            val isSpeech = detector.isSpeech(frameToPcm16(working, offset))
            onFrame(working, offset, isSpeech)?.let { completed.add(it) }
            offset += frameSamples
        }
        val rem = working.size - offset
        if (carry.size < rem) carry = FloatArray(rem)
        if (rem > 0) working.copyInto(carry, 0, offset, working.size)
        carryLen = rem
        return completed
    }

    private fun onFrame(buf: FloatArray, off: Int, isSpeech: Boolean): SpeechSegment? {
        val frameStartSample = processedSamples
        processedSamples += frameSamples
        if (isSpeech) {
            if (!inSpeech) {
                inSpeech = true
                speechStartSample = frameStartSample
                speechLen = 0
                silenceSamples = 0
            }
            appendSpeech(buf, off)
            silenceSamples = 0
            if (speechLen >= maxSpeechSamples) return emit()
        } else if (inSpeech) {
            appendSpeech(buf, off)
            silenceSamples += frameSamples
            if (silenceSamples >= minSilenceSamples) {
                return if (speechLen >= minSpeechSamples) emit() else { resetSpeech(); null }
            }
        }
        return null
    }

    private fun appendSpeech(buf: FloatArray, off: Int) {
        if (speechLen + frameSamples > speech.size) {
            var n = speech.size
            while (n < speechLen + frameSamples) n *= 2
            speech = speech.copyOf(n)
        }
        buf.copyInto(speech, speechLen, off, off + frameSamples)
        speechLen += frameSamples
    }

    private fun emit(): SpeechSegment {
        val arr = speech.copyOf(speechLen)
        val start = speechStartSample.toDouble() / config.sampleRate
        val end = start + arr.size.toDouble() / config.sampleRate
        resetSpeech()
        return SpeechSegment(arr, start, end)
    }

    private fun resetSpeech() {
        inSpeech = false
        silenceSamples = 0
        speechLen = 0
    }

    /** True while an utterance is being accumulated — drives the UI speech indicator. */
    val isSpeaking: Boolean get() = inSpeech

    /** In-progress speech audio for interim transcription, or null if too short / idle. */
    fun pendingAudio(): FloatArray? {
        if (!inSpeech || speechLen < minSpeechSamples) return null
        return speech.copyOf(speechLen)
    }

    /** On stop: emit a trailing segment if it meets the min-speech length, then clear all state. */
    fun flush(): SpeechSegment? {
        val seg = if (inSpeech && speechLen >= minSpeechSamples) emit() else null
        reset()
        return seg
    }

    fun reset() {
        carryLen = 0
        processedSamples = 0L
        resetSpeech()
    }

    private fun frameToPcm16(buf: FloatArray, off: Int): ByteArray {
        val out = ByteArray(frameSamples * 2)
        var p = 0
        var i = off
        val end = off + frameSamples
        while (i < end) {
            val s = buf[i]
            val c = if (s > 1f) 1f else if (s < -1f) -1f else s
            val v = (c * 32767f).toInt()
            out[p++] = (v and 0xFF).toByte()
            out[p++] = ((v shr 8) and 0xFF).toByte()
            i++
        }
        return out
    }
}

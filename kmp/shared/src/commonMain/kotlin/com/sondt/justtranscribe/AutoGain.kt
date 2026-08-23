package com.sondt.justtranscribe

import kotlin.math.abs

/**
 * Adaptive microphone gain, ported from the Flutter `pipeline_service` (~30x to
 * lift a ~0.01 mic level toward the 0.1–0.5 range Silero/ASR prefer). Uses an
 * exponential moving average toward [targetPeak] with a [maxGain] ceiling and
 * soft clipping.
 *
 * **Disabled by default**: the POC verified detection on raw mic audio. Enable per
 * device if the mic is too quiet; gain also affects the audio sent to ASR.
 * Stateful — construct one per session, [reset] on stop.
 */
class AutoGain(
    private val enabled: Boolean = false,
    private val targetPeak: Float = 0.3f,
    private val maxGain: Float = 40.0f,
    private val initialGain: Float = 10.0f,
) {
    private var currentGain = initialGain

    /** The gain currently applied (for diagnostics/tests). */
    val gain: Float get() = currentGain

    fun reset() { currentGain = initialGain }

    /** Returns amplified samples (new array) when enabled, or [samples] unchanged when disabled. */
    fun apply(samples: FloatArray): FloatArray {
        if (!enabled) return samples
        var rawMax = 0f
        for (s in samples) {
            val a = abs(s)
            if (a > rawMax) rawMax = a
        }
        if (rawMax > 0.001f) {
            val desired = (targetPeak / rawMax).coerceIn(1.0f, maxGain)
            currentGain = currentGain * 0.95f + desired * 0.05f
        }
        val out = FloatArray(samples.size)
        for (i in samples.indices) {
            var v = samples[i] * currentGain
            if (v > 1f) v = 1f
            if (v < -1f) v = -1f
            out[i] = v
        }
        return out
    }
}

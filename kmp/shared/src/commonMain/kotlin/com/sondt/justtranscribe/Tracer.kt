package com.sondt.justtranscribe

/**
 * Diagnostics seam for the pipeline. Always-on: [PipelineController] calls it
 * unconditionally, with [NoopTracer] as the default so tests and platforms without
 * a file tracer pay nothing. Implementations stamp timestamps at [emit] time —
 * commonMain carries no clock dependency.
 *
 * Contract for implementations: every method must be cheap and non-blocking on the
 * caller's thread (the audio path calls [emit] and [onAudioChunk] directly).
 */
interface Tracer {
    /** A recording session begins; storage/session state may be created lazily. */
    fun startSession()

    /** The session ended; buffered events must be flushed. */
    fun endSession()

    /** Record one structured event. [fields] values: String/Boolean/Int/Long/Double/null. */
    fun emit(type: String, fields: Map<String, Any?> = emptyMap())

    /**
     * Save [samples] as a WAV in the session directory when audio debugging is
     * enabled; returns the stored filename, or null when disabled/unavailable.
     */
    fun saveWav(label: String, samples: FloatArray): String?

    /** Raw captured audio, feeding the stall ring buffer (no-op unless audio debug is on). */
    fun onAudioChunk(samples: FloatArray)
}

object NoopTracer : Tracer {
    override fun startSession() {}
    override fun endSession() {}
    override fun emit(type: String, fields: Map<String, Any?>) {}
    override fun saveWav(label: String, samples: FloatArray): String? = null
    override fun onAudioChunk(samples: FloatArray) {}
}

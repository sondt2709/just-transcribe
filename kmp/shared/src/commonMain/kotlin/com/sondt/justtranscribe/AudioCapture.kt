package com.sondt.justtranscribe

import kotlinx.coroutines.flow.Flow

/**
 * Platform microphone capture. Resolves a usable sample rate at construction
 * (prefers 16000 Hz, falls back to 44100 Hz) and exposes raw PCM 16-bit mono
 * frames as a cold Flow. Collecting starts the mic; cancelling the collector
 * stops and releases it.
 */
expect class AudioCapture() {
    /** The sample rate actually in use (16000 if supported, else 44100). */
    val sampleRate: Int

    /** Cold flow of raw little-endian PCM 16-bit mono byte chunks (~100ms each). */
    fun pcmFrames(): Flow<ByteArray>
}

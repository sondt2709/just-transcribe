package com.sondt.justtranscribe

/**
 * Per-frame speech detector seam. Implementations operate on exactly one Silero
 * frame of 16-bit mono PCM (512 samples = 1024 bytes at 16 kHz). Stateful across
 * calls, so a single instance must process frames of one stream in order; create a
 * fresh instance per streaming session and [close] it when done.
 *
 * An interface (rather than expect/actual) because the Android implementation needs
 * a platform Context, and so unit tests can inject a fake.
 */
interface VoiceActivityDetector {
    /** True if this single 1024-byte frame is classified as speech. */
    fun isSpeech(frame: ByteArray): Boolean

    /** Release any native resources held by the detector. */
    fun close()
}

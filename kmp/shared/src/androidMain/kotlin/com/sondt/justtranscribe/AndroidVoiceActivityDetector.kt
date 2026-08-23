package com.sondt.justtranscribe

import android.content.Context
import com.konovalov.vad.silero.VadSilero
import com.konovalov.vad.silero.config.FrameSize
import com.konovalov.vad.silero.config.Mode
import com.konovalov.vad.silero.config.SampleRate

/**
 * Silero VAD backed by gkonovalov/android-vad, running on the CPU (ONNX Runtime).
 *
 * Built with silenceDurationMs/speechDurationMs = 0 so [isSpeech] returns the raw
 * per-frame decision; onset/hangover/pre-roll hysteresis is owned by the pure-Kotlin
 * SpeechGate so it stays unit-testable. Only 16 kHz with a 512-sample (1024-byte)
 * frame is used — callers must not enable VAD when capture fell back to 44.1 kHz.
 *
 * Stateful: construct fresh per streaming session and [close] it when done.
 */
class AndroidVoiceActivityDetector(context: Context) : VoiceActivityDetector {

    private val vad = VadSilero(
        context.applicationContext,
        sampleRate = SampleRate.SAMPLE_RATE_16K,
        frameSize = FrameSize.FRAME_SIZE_512,
        mode = Mode.NORMAL,
        silenceDurationMs = 0,
        speechDurationMs = 0,
    )

    /** [frame] must be exactly 1024 bytes (512 samples, 16-bit mono). */
    override fun isSpeech(frame: ByteArray): Boolean = vad.isSpeech(frame)

    override fun close() = vad.close()
}

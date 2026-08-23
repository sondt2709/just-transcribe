package com.sondt.justtranscribe

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive

private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
private const val FRAME_BYTES = 3200 // ~100ms at 16kHz/16-bit mono

/** Requires RECORD_AUDIO to have been granted before pcmFrames() is collected. */
actual class AudioCapture actual constructor() {
    actual val sampleRate: Int = resolveSampleRate()

    actual fun pcmFrames(): Flow<ByteArray> = flow {
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, CHANNEL, ENCODING)
        val bufferBytes = maxOf(minBuf, FRAME_BYTES) * 2
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            CHANNEL,
            ENCODING,
            bufferBytes,
        )
        // release() is always safe; stop() throws if the recorder was never started,
        // so only call stop() inside the try after startRecording() succeeds.
        try {
            check(recorder.state == AudioRecord.STATE_INITIALIZED) {
                "AudioRecord failed to initialize"
            }
            val buffer = ByteArray(FRAME_BYTES)
            recorder.startRecording()
            while (currentCoroutineContext().isActive) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read > 0) emit(buffer.copyOf(read))
            }
            recorder.stop()
        } finally {
            recorder.release()
        }
    }.flowOn(Dispatchers.IO)

    private companion object {
        fun resolveSampleRate(): Int {
            for (rate in intArrayOf(16000, 44100)) {
                val mb = AudioRecord.getMinBufferSize(rate, CHANNEL, ENCODING)
                if (mb != AudioRecord.ERROR && mb != AudioRecord.ERROR_BAD_VALUE) return rate
            }
            error("No supported PCM 16-bit mono sample rate on this device")
        }
    }
}

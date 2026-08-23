package com.sondt.justtranscribe.debug

import android.content.Context
import com.sondt.justtranscribe.AppConfig
import com.sondt.justtranscribe.Tracer
import com.sondt.justtranscribe.WavEncoder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.time.ComparableTimeMark
import kotlin.time.DurationUnit
import kotlin.time.TimeSource

/**
 * Android [Tracer]: one JSONL file per recording session under
 * `filesDir/sessions/<name>/events.jsonl`, plus opt-in WAV capture.
 *
 * Never blocks the caller: [emit] formats the line and sends it to a channel drained
 * by a writer coroutine on [Dispatchers.IO] (flushed at least once per second and on
 * [endSession]); [onAudioChunk] copies into a preallocated 60s ring buffer, active
 * only when [debugAudio] is on. A `stall` event triggers a ring dump to WAV.
 */
class FileTracer(
    private val context: Context,
    private val scope: CoroutineScope,
    private val configProvider: () -> AppConfig,
) : Tracer {
    @Volatile var debugAudio: Boolean = false

    private val lock = Any()
    private var sessionMark: ComparableTimeMark? = null
    private var channel: Channel<String>? = null
    private var writerJob: Job? = null

    @Volatile private var sessionDir: File? = null
    private var wavCounter = 0
    private var ringDumpCounter = 0

    // 60s mono ring at 16 kHz (~3.8 MB); only written when debugAudio is on.
    private val ring = FloatArray(RING_SECONDS * SAMPLE_RATE)
    private var ringPos = 0
    private var ringFilled = 0

    override fun startSession() {
        synchronized(lock) {
            if (channel != null) return
            val name = DebugSessions.newSessionName()
            sessionMark = TimeSource.Monotonic.markNow()
            wavCounter = 0
            ringDumpCounter = 0
            ringPos = 0
            ringFilled = 0
            val ch = Channel<String>(Channel.UNLIMITED)
            channel = ch
            writerJob = scope.launch(Dispatchers.IO) {
                DebugSessions.ensureDailyCleanup(context)
                val dir = File(DebugSessions.sessionsDir(context), name).apply { mkdirs() }
                sessionDir = dir
                File(dir, "events.jsonl").bufferedWriter().use { w ->
                    while (true) {
                        val result = withTimeoutOrNull(FLUSH_MS) { ch.receiveCatching() }
                        when {
                            result == null -> w.flush() // idle tick
                            result.isClosed -> break
                            else -> { w.write(result.getOrThrow()); w.newLine() }
                        }
                    }
                }
            }
        }
        val c = configProvider()
        emit(
            "session_start",
            mapOf(
                "asr_url" to c.asrBaseUrl,
                "asr_model" to c.asrModel,
                "asr_language" to c.asrLanguage,
                "llm_url" to c.llmApiBase,
                "llm_model" to c.llmModel,
                "languages" to listOf(c.preferredLanguage, c.preferredLanguage2).filter { it.isNotEmpty() }.joinToString(","),
                "debug_audio" to debugAudio,
            ),
        )
    }

    override fun endSession() {
        emit("session_end")
        synchronized(lock) {
            channel?.close()
            channel = null
            sessionMark = null
            sessionDir = null
        }
    }

    override fun emit(type: String, fields: Map<String, Any?>) {
        val (ch, mark) = synchronized(lock) { (channel ?: return) to (sessionMark ?: return) }
        if (type == "stall") dumpRing()
        val sb = StringBuilder(128)
        sb.append("{\"ts_ms\":").append(System.currentTimeMillis())
        sb.append(",\"elapsed_s\":").append(formatSeconds(mark.elapsedNow().toDouble(DurationUnit.SECONDS)))
        sb.append(",\"type\":\"").append(type).append('"')
        for ((k, v) in fields) {
            sb.append(",\"").append(k).append("\":")
            appendJsonValue(sb, v)
        }
        sb.append('}')
        ch.trySend(sb.toString())
    }

    override fun saveWav(label: String, samples: FloatArray): String? {
        if (!debugAudio) return null
        val dir = sessionDir ?: return null
        val name = "${label}_${++wavCounter}.wav"
        return try {
            File(dir, name).writeBytes(WavEncoder.encode(samples))
            name
        } catch (_: Throwable) {
            null
        }
    }

    override fun onAudioChunk(samples: FloatArray) {
        if (!debugAudio) return
        synchronized(ring) {
            for (s in samples) {
                ring[ringPos] = s
                ringPos = (ringPos + 1) % ring.size
            }
            ringFilled = minOf(ringFilled + samples.size, ring.size)
        }
    }

    /** Write the ring buffer (chronological order) as a WAV in the session dir. */
    private fun dumpRing() {
        if (!debugAudio) return
        val dir = sessionDir ?: return
        val ordered: FloatArray = synchronized(ring) {
            if (ringFilled == 0) return
            FloatArray(ringFilled).also { out ->
                val start = if (ringFilled < ring.size) 0 else ringPos
                for (i in 0 until ringFilled) out[i] = ring[(start + i) % ring.size]
            }
        }
        val name = "stall_ring_${++ringDumpCounter}.wav"
        scope.launch(Dispatchers.IO) {
            runCatching { File(dir, name).writeBytes(WavEncoder.encode(ordered)) }
        }
    }

    private fun appendJsonValue(sb: StringBuilder, v: Any?) {
        when (v) {
            null -> sb.append("null")
            is Boolean, is Int, is Long -> sb.append(v.toString())
            is Double -> sb.append(if (v.isFinite()) formatSeconds(v) else "null")
            is Float -> appendJsonValue(sb, v.toDouble())
            else -> {
                sb.append('"')
                for (c in v.toString()) {
                    when (c) {
                        '"' -> sb.append("\\\"")
                        '\\' -> sb.append("\\\\")
                        '\n' -> sb.append("\\n")
                        '\r' -> sb.append("\\r")
                        '\t' -> sb.append("\\t")
                        else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
                    }
                }
                sb.append('"')
            }
        }
    }

    /** Compact fixed-point (3 decimals) — avoids scientific notation and locale commas in JSONL. */
    private fun formatSeconds(v: Double): String =
        "%.3f".format(java.util.Locale.US, v).trimEnd('0').trimEnd('.')

    private companion object {
        const val SAMPLE_RATE = 16000
        const val RING_SECONDS = 60
        const val FLUSH_MS = 1000L
    }
}

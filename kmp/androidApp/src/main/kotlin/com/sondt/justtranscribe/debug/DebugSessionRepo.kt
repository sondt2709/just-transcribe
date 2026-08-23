package com.sondt.justtranscribe.debug

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class SessionMeta(
    val dir: File,
    val name: String,
    val durationS: Double,
    val eventCount: Int,
    val errorCount: Int,
    val stallCount: Int,
    val sizeBytes: Long,
)

data class SessionEvent(
    val tsMs: Long,
    val elapsedS: Double,
    val type: String,
    val summary: String,
    val raw: String,
    val wav: String?,
)

data class SessionDetail(
    val events: List<SessionEvent>,
    val interimCount: Int,
    val heartbeatCount: Int,
    val maxBeatGapS: Double,
)

/** Reads, summarizes, zips, and shares recorded debug sessions. All I/O off-main. */
object DebugSessionRepo {

    private val ERROR_TYPES = setOf("asr_error", "translate_error", "capture_error")

    suspend fun listSessions(context: Context): List<SessionMeta> = withContext(Dispatchers.IO) {
        DebugSessions.ensureDailyCleanup(context)
        val dirs = DebugSessions.sessionsDir(context).listFiles()?.filter { it.isDirectory } ?: emptyList()
        dirs.sortedByDescending { it.name }.mapNotNull { dir ->
            val events = File(dir, "events.jsonl")
            if (!events.exists()) return@mapNotNull null
            var count = 0
            var errors = 0
            var stalls = 0
            var lastElapsed = 0.0
            events.forEachLine { line ->
                count++
                // Cheap scan: full JSON parse only where needed.
                val type = extractType(line) ?: return@forEachLine
                if (type in ERROR_TYPES) errors++
                if (type == "stall") stalls++
                extractElapsed(line)?.let { lastElapsed = it }
            }
            val size = dir.listFiles()?.sumOf { it.length() } ?: 0L
            SessionMeta(dir, dir.name, lastElapsed, count, errors, stalls, size)
        }
    }

    suspend fun totalStorageBytes(context: Context): Long = withContext(Dispatchers.IO) {
        DebugSessions.sessionsDir(context).walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    /** Bytes held by debug WAVs across all sessions (the dominant storage cost). */
    suspend fun audioStorageBytes(context: Context): Long = withContext(Dispatchers.IO) {
        DebugSessions.sessionsDir(context).walkTopDown()
            .filter { it.isFile && it.extension == "wav" }
            .sumOf { it.length() }
    }

    /** Delete every debug WAV in every session; trace logs are kept. */
    suspend fun deleteAllAudio(context: Context) = withContext(Dispatchers.IO) {
        DebugSessions.sessionsDir(context).walkTopDown()
            .filter { it.isFile && it.extension == "wav" }
            .forEach { it.delete() }
    }

    /**
     * Important events only: interim ASR traffic is collapsed to a count and
     * heartbeats to a count + max inter-beat gap (they dominate raw volume).
     */
    suspend fun loadDetail(dir: File): SessionDetail = withContext(Dispatchers.IO) {
        val events = ArrayList<SessionEvent>()
        var interims = 0
        var beats = 0
        var lastBeat = -1.0
        var maxGap = 0.0
        File(dir, "events.jsonl").forEachLine { line ->
            val o = runCatching { JSONObject(line) }.getOrNull() ?: return@forEachLine
            val type = o.optString("type")
            val elapsed = o.optDouble("elapsed_s", 0.0)
            when {
                type == "heartbeat" -> {
                    beats++
                    if (lastBeat >= 0) maxGap = maxOf(maxGap, elapsed - lastBeat)
                    lastBeat = elapsed
                }
                // Interim ASR traffic is collapsed — but interim *errors* stay visible.
                (type == "asr_call" || type == "asr_done") && o.optString("kind") == "interim" -> {
                    if (type == "asr_call") interims++
                }
                else -> events.add(
                    SessionEvent(
                        tsMs = o.optLong("ts_ms"),
                        elapsedS = elapsed,
                        type = type,
                        summary = summarize(type, o),
                        raw = o.toString(2),
                        // Only offer playback for WAVs that still exist on disk.
                        wav = o.optString("wav").takeIf { it.isNotEmpty() && File(dir, it).exists() },
                    ),
                )
            }
        }
        SessionDetail(events, interims, beats, maxGap)
    }

    private fun summarize(type: String, o: JSONObject): String = when (type) {
        "session_start" -> "${o.optString("asr_model")} @ ${o.optString("asr_url")}"
        "session_end" -> "recording stopped"
        "vad_speech_start" -> "speech started"
        "vad_speech_end" -> "speech ended"
        "segment" -> "%.1fs of speech".format(java.util.Locale.US, o.optDouble("duration_s", 0.0))
        "asr_call" -> "final ASR call (%.1fs audio)".format(java.util.Locale.US, o.optDouble("audio_s", 0.0))
        "asr_done" -> {
            val text = o.optString("text")
            val head = if (text.isNotEmpty()) "“$text”" else "${o.optInt("text_len")} chars"
            "$head (${o.optString("lang", "?")}) — ${o.optLong("latency_ms")}ms"
        }
        "asr_error" -> {
            val kind = o.optString("kind")
            val prefix = if (kind == "interim") "interim: " else ""
            "$prefix${o.optString("message")} — ${o.optLong("latency_ms")}ms"
        }
        "translate_call" -> "segment #${o.optInt("id")}"
        "translate_done" -> "${o.optInt("count")} result(s) — ${o.optLong("latency_ms")}ms"
        "translate_error" -> o.optString("message")
        "stall" -> "no ASR answer for %.0fs".format(java.util.Locale.US, o.optDouble("unanswered_s", 0.0))
        "capture_error" -> o.optString("message")
        else -> ""
    }

    /** Zip the whole session directory into cacheDir/exports and open the share sheet. */
    suspend fun shareSession(context: Context, dir: File) {
        val zip = withContext(Dispatchers.IO) {
            val exports = File(context.cacheDir, "exports").apply { mkdirs() }
            val out = File(exports, "${dir.name}.zip")
            ZipOutputStream(out.outputStream().buffered()).use { z ->
                dir.listFiles()?.filter { it.isFile }?.forEach { f ->
                    z.putNextEntry(ZipEntry("${dir.name}/${f.name}"))
                    f.inputStream().use { it.copyTo(z) }
                    z.closeEntry()
                }
            }
            out
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", zip)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/zip"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(
            Intent.createChooser(send, "Share debug session").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun formatSize(bytes: Long): String = when {
        bytes >= 1 shl 20 -> "%.1f MB".format(java.util.Locale.US, bytes / 1048576.0)
        bytes >= 1 shl 10 -> "%.0f KB".format(java.util.Locale.US, bytes / 1024.0)
        else -> "$bytes B"
    }

    private fun extractType(line: String): String? {
        val i = line.indexOf("\"type\":\"")
        if (i < 0) return null
        val start = i + 8
        val end = line.indexOf('"', start)
        return if (end > start) line.substring(start, end) else null
    }

    private fun extractElapsed(line: String): Double? {
        val i = line.indexOf("\"elapsed_s\":")
        if (i < 0) return null
        val start = i + 12
        var end = start
        while (end < line.length && (line[end].isDigit() || line[end] == '.' || line[end] == '-')) end++
        return line.substring(start, end).toDoubleOrNull()
    }
}

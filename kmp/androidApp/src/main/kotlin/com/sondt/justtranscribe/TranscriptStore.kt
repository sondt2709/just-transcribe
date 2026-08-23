package com.sondt.justtranscribe

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Persists the current conversation as `filesDir/transcript.json` so it survives
 * process death and can be resumed (kmp-transcript-history). A single JSON file:
 * one conversation, trivially clearable.
 */
class TranscriptStore(context: Context) {
    private val file = File(context.filesDir, "transcript.json")

    fun hasSnapshot(): Boolean = file.exists() && file.length() > 0

    suspend fun load(): TranscriptSnapshot? = withContext(Dispatchers.IO) {
        runCatching { TranscriptSnapshot.fromJson(file.readText()) }.getOrNull()
            ?.takeIf { !it.isEmpty }
    }

    /** Callers never pass an empty snapshot (persistLoop filters them); deletion is [clear]. */
    suspend fun save(snapshot: TranscriptSnapshot) = withContext(Dispatchers.IO) {
        runCatching {
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.writeText(snapshot.toJson())
            tmp.renameTo(file)
        }
    }

    suspend fun clear() = withContext(Dispatchers.IO) { runCatching { file.delete() } }
}

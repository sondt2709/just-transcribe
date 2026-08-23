package com.sondt.justtranscribe

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * A persistable snapshot of one conversation: the finalized segments and their
 * translations (keyed by segment id). Written to disk by the app layer so a
 * conversation survives process death and can be resumed later. JSON codec lives
 * here so the app layer needs no serialization dependency of its own.
 */
@Serializable
data class TranscriptSnapshot(
    val segments: List<TranscriptSegment> = emptyList(),
    val translations: Map<Int, List<TranslationResult>> = emptyMap(),
) {
    val maxSegmentId: Int get() = segments.maxOfOrNull { it.id } ?: 0
    val isEmpty: Boolean get() = segments.isEmpty()

    fun toJson(): String = json.encodeToString(serializer(), this)

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        /** Null on malformed/blank input rather than throwing. */
        fun fromJson(s: String): TranscriptSnapshot? =
            runCatching { json.decodeFromString(serializer(), s) }.getOrNull()
    }
}

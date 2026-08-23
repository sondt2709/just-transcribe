package com.sondt.justtranscribe

/**
 * Plain-text export of a conversation, mirroring the home screen exactly: a
 * `Speaker [LANG]` header line, the original text, then one `[LANG] text` line
 * per translation; segments separated by a blank line. Pure; unit-tested.
 */
object TranscriptExporter {
    fun format(
        segments: List<TranscriptSegment>,
        translations: Map<Int, List<TranslationResult>>,
    ): String = segments.joinToString("\n\n") { seg ->
        buildString {
            append(seg.speaker).append(" [").append(seg.lang.uppercase()).append("]\n")
            append(seg.text)
            for (tr in translations[seg.id].orEmpty()) {
                append("\n[").append(tr.targetLang.uppercase()).append("] ").append(tr.translatedText)
            }
        }
    }
}

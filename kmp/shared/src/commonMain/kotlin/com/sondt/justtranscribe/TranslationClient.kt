package com.sondt.justtranscribe

import io.ktor.client.HttpClient
import io.ktor.client.plugins.timeout
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Remote translation over an OpenAI-compatible chat API, ported from the Flutter
 * `translation_service`. Translates a segment in parallel to the configured
 * preferred languages that differ from its detected language, including up to
 * [MAX_CONTEXT] preceding segments as context. Per-target failures are non-fatal.
 */
class TranslationClient(
    private val http: HttpClient,
    @Volatile private var config: AppConfig,
) : Translator {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    // Guarded by [contextMutex]: translate() runs concurrently (one call per
    // finalized segment) and an unguarded deque loses results to races.
    private val recent = ArrayDeque<TranscriptSegment>()
    private val contextMutex = Mutex()

    fun updateConfig(c: AppConfig) { config = c }

    /**
     * Seed the conversation context from a restored transcript so translations of
     * appended segments keep continuity. Keeps only the trailing [MAX_CONTEXT].
     */
    suspend fun seedContext(segments: List<TranscriptSegment>) = contextMutex.withLock {
        recent.clear()
        for (s in segments.takeLast(MAX_CONTEXT)) recent.addLast(s)
    }

    val isConfigured: Boolean get() = config.isLlmConfigured

    override suspend fun translate(segment: TranscriptSegment): List<TranslationResult> = coroutineScope {
        val targets = translationTargets(segment.lang, config.preferredLanguage, config.preferredLanguage2)
        if (targets.isEmpty() || !config.isLlmConfigured) return@coroutineScope emptyList()

        val context = contextMutex.withLock {
            recent.addLast(segment)
            while (recent.size > MAX_CONTEXT + 1) recent.removeFirst()
            recent.toList().dropLast(1)
        }

        targets.map { lang ->
            async { runCatching { translateTo(segment, lang, context) }.getOrNull() }
        }.awaitAll().filterNotNull()
    }

    @Serializable private data class ChatMessage(val role: String, val content: String)
    @Serializable private data class ChatRequest(
        val model: String,
        val messages: List<ChatMessage>,
        val temperature: Double = 0.3,
        @SerialName("max_tokens") val maxTokens: Int = 512,
    )
    @Serializable private data class Choice(val message: ChatMessage? = null)
    @Serializable private data class ChatResponse(val choices: List<Choice> = emptyList())

    private suspend fun translateTo(
        segment: TranscriptSegment,
        targetLang: String,
        context: List<TranscriptSegment>,
    ): TranslationResult? {
        val targetName = LANG_NAMES[targetLang] ?: targetLang
        val prompt = buildPrompt(targetName, context)
        val base = config.llmApiBase.trimEnd('/')
        val req = ChatRequest(
            model = config.llmModel,
            messages = listOf(ChatMessage("system", prompt), ChatMessage("user", segment.text)),
        )
        val resp = http.post("$base/v1/chat/completions") {
            if (config.llmApiKey.isNotEmpty()) header(HttpHeaders.Authorization, "Bearer ${config.llmApiKey}")
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(ChatRequest.serializer(), req))
            timeout { requestTimeoutMillis = 10_000 }
        }
        if (!resp.status.isSuccess()) return null
        val parsed = json.decodeFromString(ChatResponse.serializer(), resp.bodyAsText())
        val content = parsed.choices.firstOrNull()?.message?.content?.trim()
        if (content.isNullOrEmpty()) return null
        return TranslationResult(segmentId = segment.id, translatedText = content, targetLang = targetLang)
    }

    companion object {
        const val MAX_CONTEXT = 3
        private val LANG_NAMES = mapOf(
            "en" to "English", "vi" to "Vietnamese", "zh" to "Chinese",
            "yue" to "Cantonese", "ja" to "Japanese", "ko" to "Korean",
        )

        /**
         * Preferred targets that differ from [segmentLang] (compared on the base
         * subtag), de-duplicated, preserving order. Pure; unit-tested.
         */
        fun translationTargets(segmentLang: String, pref1: String, pref2: String): List<String> {
            val seg = segmentLang.lowercase().substringBefore('-')
            val targets = ArrayList<String>()
            for (lang in listOf(pref1, pref2)) {
                if (lang.isEmpty()) continue
                val base = lang.lowercase().substringBefore('-')
                if (base != seg && !targets.contains(lang)) targets.add(lang)
            }
            return targets
        }

        /** `[speaker]: text` lines for the preceding segments. Pure; unit-tested. */
        fun buildContextLines(context: List<TranscriptSegment>): List<String> =
            context.map { "[${it.speaker}]: ${it.text}" }

        /** System prompt; appends a context block only when there is context. Pure; unit-tested. */
        fun buildPrompt(targetName: String, context: List<TranscriptSegment>): String {
            var p = "Translate the following to $targetName. Output ONLY the translation, nothing else."
            val lines = buildContextLines(context)
            if (lines.isNotEmpty()) {
                p += "\n\nContext from the conversation:\n${lines.joinToString("\n")}\n\nText to translate:"
            }
            return p
        }
    }
}

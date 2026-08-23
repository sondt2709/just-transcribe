package com.sondt.justtranscribe

import io.ktor.client.HttpClient
import io.ktor.client.plugins.timeout
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Remote ASR over an OpenAI-compatible HTTP API, ported from the Flutter
 * `asr_service`. Encodes a segment to WAV and POSTs it multipart to
 * `{base}/v1/audio/transcriptions`. Retries once on transient 5xx/429.
 */
class AsrClient(
    private val http: HttpClient,
    @Volatile private var config: AppConfig,
) : Transcriber {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private var segmentCounter = 0

    fun updateConfig(c: AppConfig) { config = c }
    override fun resetCounter(start: Int) { segmentCounter = start }

    @Serializable
    private data class AsrResponse(val text: String? = null, val language: String? = null)

    /**
     * Transcribe a segment. Returns null on empty text. When [assignId] is false
     * (interim transcription), no segment id is consumed — this replaces the
     * Flutter counter save/restore dance.
     */
    override suspend fun transcribe(
        samples: FloatArray,
        startTime: Double,
        endTime: Double,
        assignId: Boolean,
    ): TranscriptSegment? {
        val body = postTranscription(samples) ?: return null
        val text = body.text?.trim().orEmpty()
        if (text.isEmpty()) return null
        val lang = normalizeLang(body.language)
        val id = if (assignId) ++segmentCounter else segmentCounter
        return TranscriptSegment(id = id, text = text, lang = lang, start = startTime, end = endTime)
    }

    private suspend fun postTranscription(samples: FloatArray): AsrResponse? {
        val base = config.asrBaseUrl.trimEnd('/')
        val url = "$base/v1/audio/transcriptions"
        val wav = WavEncoder.encode(samples)
        var attempt = 0
        while (true) {
            val resp = http.post(url) {
                if (config.asrApiKey.isNotEmpty()) header(HttpHeaders.Authorization, "Bearer ${config.asrApiKey}")
                setBody(
                    MultiPartFormDataContent(
                        formData {
                            append("file", wav, Headers.build {
                                append(HttpHeaders.ContentType, "audio/wav")
                                append(HttpHeaders.ContentDisposition, "filename=\"segment.wav\"")
                            })
                            append("model", config.asrModel)
                            if (config.asrLanguage.isNotEmpty()) append("language", config.asrLanguage)
                        },
                    ),
                )
                timeout { requestTimeoutMillis = 30_000 }
            }
            if (resp.status.isSuccess()) {
                return json.decodeFromString(AsrResponse.serializer(), resp.bodyAsText())
            }
            if (resp.status.value in RETRYABLE && attempt < 1) {
                attempt++
                delay(1000)
                continue
            }
            error("ASR HTTP ${resp.status.value}")
        }
    }

    @Serializable private data class ModelEntry(val id: String = "")
    @Serializable private data class ModelsResponse(
        val data: List<ModelEntry> = emptyList(),
        val models: List<ModelEntry> = emptyList(),
    )

    sealed interface ConnTest {
        data class Ok(val models: List<String>) : ConnTest
        data class Err(val message: String) : ConnTest
    }

    /** Probe `{url}/v1/models` for connectivity + the available model ids. */
    suspend fun testConnection(url: String, apiKey: String = ""): ConnTest = try {
        val base = url.trimEnd('/')
        val resp = http.get("$base/v1/models") {
            if (apiKey.isNotEmpty()) header(HttpHeaders.Authorization, "Bearer $apiKey")
            timeout { requestTimeoutMillis = 10_000 }
        }
        if (!resp.status.isSuccess()) {
            ConnTest.Err("HTTP ${resp.status.value}")
        } else {
            val parsed = json.decodeFromString(ModelsResponse.serializer(), resp.bodyAsText())
            ConnTest.Ok((parsed.data + parsed.models).map { it.id }.filter { it.isNotEmpty() })
        }
    } catch (e: Throwable) {
        ConnTest.Err(e.message ?: "Unknown error")
    }

    companion object {
        private val RETRYABLE = setOf(429, 500, 502, 503)
        private val LANG_NAME_TO_CODE = mapOf(
            "english" to "en", "vietnamese" to "vi", "chinese" to "zh", "mandarin" to "zh",
            "cantonese" to "yue", "japanese" to "ja", "korean" to "ko", "french" to "fr",
            "german" to "de", "spanish" to "es", "portuguese" to "pt", "russian" to "ru",
            "thai" to "th", "indonesian" to "id", "malay" to "ms",
        )

        /** Normalize an ASR language string (code or full name) to a short code. Pure; unit-tested. */
        fun normalizeLang(raw: String?): String {
            if (raw.isNullOrEmpty()) return "unknown"
            val lower = raw.lowercase().trim()
            if (lower.length <= 3) return lower
            return LANG_NAME_TO_CODE[lower] ?: lower
        }
    }
}

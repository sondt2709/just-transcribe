package com.sondt.justtranscribe

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpTimeout
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TranslationClientTest {
    @Test
    fun targetsExcludeSegmentLanguage() {
        assertEquals(listOf("vi"), TranslationClient.translationTargets("en", "vi", ""))
        assertEquals(listOf("vi"), TranslationClient.translationTargets("en", "en", "vi"))
        assertEquals(emptyList(), TranslationClient.translationTargets("en", "en", "en"))
    }

    @Test
    fun targetsAreDeduped() {
        assertEquals(listOf("vi"), TranslationClient.translationTargets("en", "vi", "vi"))
    }

    @Test
    fun targetsCompareOnBaseSubtag() {
        // segment en-US vs preferred en → same base, excluded.
        assertEquals(listOf("vi"), TranslationClient.translationTargets("en-US", "en", "vi"))
    }

    @Test
    fun promptOmitsContextBlockWhenEmpty() {
        val p = TranslationClient.buildPrompt("Vietnamese", emptyList())
        assertTrue(p.startsWith("Translate the following to Vietnamese"))
        assertTrue(!p.contains("Context from the conversation"))
    }

    @Test
    fun concurrentTranslationsAllReturnResults() = runTest {
        val engine = MockEngine {
            respond(
                content = """{"choices":[{"message":{"role":"assistant","content":"t"}}]}""",
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = TranslationClient(
            HttpClient(engine) { install(HttpTimeout) },
            AppConfig(
                llmApiBase = "http://test",
                llmModel = "m",
                preferredLanguage = "vi",
                preferredLanguage2 = "en",
            ),
        )
        val segments = (1..20).map {
            TranscriptSegment(id = it, text = "s$it", lang = "ja", start = 0.0, end = 1.0)
        }

        val results = segments.map { s -> async { client.translate(s) } }.awaitAll()

        // Every segment translated to both targets; no result lost to a context race.
        results.forEach { r -> assertEquals(2, r.size) }
    }

    @Test
    fun promptIncludesContextLines() {
        val ctx = listOf(
            TranscriptSegment(id = 1, text = "hello", lang = "en", start = 0.0, end = 1.0),
            TranscriptSegment(id = 2, text = "world", lang = "en", start = 1.0, end = 2.0),
        )
        val lines = TranslationClient.buildContextLines(ctx)
        assertEquals(listOf("[You]: hello", "[You]: world"), lines)

        val p = TranslationClient.buildPrompt("Vietnamese", ctx)
        assertTrue(p.contains("Context from the conversation"))
        assertTrue(p.contains("[You]: hello"))
    }
}

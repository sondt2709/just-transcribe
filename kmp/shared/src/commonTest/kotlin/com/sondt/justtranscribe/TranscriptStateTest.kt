@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package com.sondt.justtranscribe

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.consumeAsFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class CountingTranscriber(private val text: String = "hello") : Transcriber {
    private var counter = 0
    override suspend fun transcribe(
        samples: FloatArray,
        startTime: Double,
        endTime: Double,
        assignId: Boolean,
    ): TranscriptSegment? {
        val id = if (assignId) ++counter else counter
        return TranscriptSegment(id = id, text = text, lang = "en", start = startTime, end = endTime)
    }
    override fun resetCounter(start: Int) { counter = start }
}

private class NoTranslator : Translator {
    override suspend fun translate(segment: TranscriptSegment): List<TranslationResult> = emptyList()
}

/** Clear/restore semantics and id-counter seeding (kmp-transcript-history spec). */
class TranscriptStateTest {
    private fun source(chunks: Int): () -> Flow<ByteArray> = { flow { repeat(chunks) { emit(ByteArray(1024)) } } }

    @Test
    fun restoreSeedsCounterPastMaxRestoredId() = runTest {
        val snapshot = TranscriptSnapshot(
            segments = listOf(
                TranscriptSegment(id = 3, text = "old a", lang = "en", start = 0.0, end = 1.0),
                TranscriptSegment(id = 7, text = "old b", lang = "en", start = 1.0, end = 2.0),
            ),
            translations = mapOf(7 to listOf(TranslationResult(7, "cũ", "vi"))),
        )
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(10),
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = CountingTranscriber(),
            translator = NoTranslator(),
        )

        pipeline.restore(snapshot)
        assertEquals(snapshot.segments, pipeline.state.value.segments)
        assertEquals(snapshot.translations, pipeline.state.value.translations)

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        val segs = pipeline.state.value.segments
        assertEquals(3, segs.size)
        assertEquals(8, segs.last().id) // appended after restored max id 7
    }

    @Test
    fun idleClearResetsCounterAndState() = runTest {
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(10),
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = CountingTranscriber(),
            translator = NoTranslator(),
        )
        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()
        assertEquals(listOf(1), pipeline.state.value.segments.map { it.id })

        pipeline.clearTranscript()
        assertTrue(pipeline.state.value.segments.isEmpty())
        assertTrue(pipeline.state.value.translations.isEmpty())

        // A new conversation starts back at id 1 (source factory yields a fresh flow).
        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()
        assertEquals(listOf(1), pipeline.state.value.segments.map { it.id })
    }

    @Test
    fun startDoesNotResetCounterMidConversation() = runTest {
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(10),
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = CountingTranscriber(),
            translator = NoTranslator(),
        )
        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()
        pipeline.start() // record again without clearing
        advanceUntilIdle()
        pipeline.stop()

        assertEquals(listOf(1, 2), pipeline.state.value.segments.map { it.id })
    }

    @Test
    fun clearWhileRecordingKeepsCounter() = runTest {
        val frames = Channel<ByteArray>(Channel.UNLIMITED)
        val pipeline = PipelineController(
            scope = this,
            audioSource = { frames.consumeAsFlow() },
            // 10 speech + 63 silence finalizes segment 1; same again for segment 2.
            detectorFactory = {
                FakeVoiceActivityDetector(List(10) { true } + List(63) { false } + List(10) { true } + List(63) { false })
            },
            asr = CountingTranscriber(),
            translator = NoTranslator(),
        )
        pipeline.start()
        repeat(73) { frames.send(ByteArray(1024)) }
        // The source stays open, so the interim/heartbeat delay loops never go idle:
        // advance bounded virtual time instead of advanceUntilIdle.
        testScheduler.advanceTimeBy(100)
        testScheduler.runCurrent()
        assertEquals(listOf(1), pipeline.state.value.segments.map { it.id })

        pipeline.clearTranscript() // recording still active — counter must not reset
        assertTrue(pipeline.state.value.segments.isEmpty())

        repeat(73) { frames.send(ByteArray(1024)) }
        testScheduler.advanceTimeBy(100)
        testScheduler.runCurrent()
        assertEquals(listOf(2), pipeline.state.value.segments.map { it.id })

        frames.close()
        pipeline.stop()
        assertEquals(listOf(2), pipeline.state.value.segments.map { it.id })
    }
}

/** Export formatting mirrors the UI (kmp-transcript-actions spec). */
class TranscriptExporterTest {
    private fun seg(id: Int, text: String, lang: String = "en") =
        TranscriptSegment(id = id, text = text, lang = lang, start = 0.0, end = 1.0)

    @Test
    fun formatsSegmentWithTwoTranslations() {
        val out = TranscriptExporter.format(
            listOf(seg(1, "Hello")),
            mapOf(1 to listOf(TranslationResult(1, "Xin chào", "vi"), TranslationResult(1, "こんにちは", "ja"))),
        )
        assertEquals("You [EN]\nHello\n[VI] Xin chào\n[JA] こんにちは", out)
    }

    @Test
    fun formatsSegmentWithoutTranslations() {
        assertEquals("You [EN]\nHello", TranscriptExporter.format(listOf(seg(1, "Hello")), emptyMap()))
    }

    @Test
    fun separatesSegmentsWithBlankLine() {
        val out = TranscriptExporter.format(
            listOf(seg(1, "one"), seg(2, "two", lang = "vi")),
            mapOf(2 to listOf(TranslationResult(2, "hai", "en"))),
        )
        assertEquals("You [EN]\none\n\nYou [VI]\ntwo\n[EN] hai", out)
    }

    @Test
    fun emptyTranscriptFormatsToEmptyString() {
        assertEquals("", TranscriptExporter.format(emptyList(), emptyMap()))
    }
}

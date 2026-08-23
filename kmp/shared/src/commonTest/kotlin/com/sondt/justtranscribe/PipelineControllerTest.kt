@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package com.sondt.justtranscribe

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class FakeTranscriber(private val text: String, private val lang: String = "en") : Transcriber {
    private var counter = 0
    override suspend fun transcribe(
        samples: FloatArray,
        startTime: Double,
        endTime: Double,
        assignId: Boolean,
    ): TranscriptSegment? {
        val id = if (assignId) ++counter else counter
        return TranscriptSegment(id = id, text = text, lang = lang, start = startTime, end = endTime)
    }
    override fun resetCounter(start: Int) { counter = start }
}

private class FakeTranslator(private val target: String = "vi") : Translator {
    override suspend fun translate(segment: TranscriptSegment): List<TranslationResult> =
        listOf(TranslationResult(segment.id, "translated:${segment.text}", target))
}

class PipelineControllerTest {
    // One 1024-byte chunk = 512 samples = one Silero frame = one detector decision.
    private fun source(chunks: Int): () -> Flow<ByteArray> = { flow { repeat(chunks) { emit(ByteArray(1024)) } } }

    @Test
    fun producesSegmentAndTranslationFromSpeechThenFlush() = runTest {
        val speechFrames = 10
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(speechFrames),
            detectorFactory = { FakeVoiceActivityDetector(List(speechFrames) { true }) },
            asr = FakeTranscriber("hello"),
            translator = FakeTranslator("vi"),
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        val s = pipeline.state.value
        assertEquals(1, s.segments.size)
        assertEquals("hello", s.segments[0].text)
        assertEquals(
            listOf("translated:hello"),
            s.translations[s.segments[0].id]?.map { it.translatedText },
        )
        assertEquals(PipelineStatus.Idle, s.status)
    }

    @Test
    fun emitsSegmentOnSilenceBoundaryDuringCollection() = runTest {
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(10 + 63), // 63 silent frames cross the 1.0s boundary
            detectorFactory = { FakeVoiceActivityDetector.of(speech = 10, silence = 63) },
            asr = FakeTranscriber("hi"),
            translator = FakeTranslator(),
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        assertTrue(pipeline.state.value.segments.isNotEmpty())
    }

    @Test
    fun audioSourceFailureLandsIdleWithErrorInsteadOfCrashing() = runTest {
        val pipeline = PipelineController(
            scope = this,
            audioSource = { flow { emit(ByteArray(1024)); throw RuntimeException("mic gone") } },
            detectorFactory = { FakeVoiceActivityDetector(List(1) { false }) },
            asr = FakeTranscriber("x"),
            translator = FakeTranslator(),
        )

        pipeline.start()
        advanceUntilIdle()

        val s = pipeline.state.value
        assertEquals(PipelineStatus.Idle, s.status)
        assertTrue((s.error ?: "").contains("mic gone"))
        assertTrue(!pipeline.isRunning)
    }

    @Test
    fun detectorFailureLandsIdleWithErrorInsteadOfCrashing() = runTest {
        val badDetector = object : VoiceActivityDetector {
            override fun isSpeech(frame: ByteArray): Boolean = throw IllegalStateException("onnx dead")
            override fun close() {}
        }
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(5),
            detectorFactory = { badDetector },
            asr = FakeTranscriber("x"),
            translator = FakeTranslator(),
        )

        pipeline.start()
        advanceUntilIdle()

        val s = pipeline.state.value
        assertEquals(PipelineStatus.Idle, s.status)
        assertTrue((s.error ?: "").contains("onnx dead"))
        assertTrue(!pipeline.isRunning)
    }

    @Test
    fun canRestartAfterPipelineFailure() = runTest {
        var attempt = 0
        val pipeline = PipelineController(
            scope = this,
            audioSource = {
                attempt++
                if (attempt == 1) flow { throw RuntimeException("first start fails") } else source(10)()
            },
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = FakeTranscriber("hello"),
            translator = FakeTranslator(),
        )

        pipeline.start()
        advanceUntilIdle()
        assertEquals(PipelineStatus.Idle, pipeline.state.value.status)

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        val s = pipeline.state.value
        assertEquals(1, s.segments.size)
        assertEquals(null, s.error)
    }

    @Test
    fun reportsErrorWhenAsrThrows() = runTest {
        val failing = object : Transcriber {
            override suspend fun transcribe(samples: FloatArray, startTime: Double, endTime: Double, assignId: Boolean): TranscriptSegment? =
                throw RuntimeException("boom")
            override fun resetCounter(start: Int) {}
        }
        val pipeline = PipelineController(
            scope = this,
            audioSource = source(10),
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = failing,
            translator = FakeTranslator(),
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        val s = pipeline.state.value
        assertTrue(s.segments.isEmpty())
        assertTrue((s.error ?: "").contains("boom"))
        assertTrue(s.consecutiveFailures >= 1)
    }
}

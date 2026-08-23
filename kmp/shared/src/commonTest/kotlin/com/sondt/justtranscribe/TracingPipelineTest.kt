@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package com.sondt.justtranscribe

import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Records every event so tests can assert on the trace the pipeline produced. */
private class RecordingTracer : Tracer {
    val events = mutableListOf<Pair<String, Map<String, Any?>>>()
    var sessions = 0
    var sessionEnds = 0
    override fun startSession() { sessions++ }
    override fun endSession() { sessionEnds++ }
    override fun emit(type: String, fields: Map<String, Any?>) { events.add(type to fields) }
    override fun saveWav(label: String, samples: FloatArray): String? = null
    override fun onAudioChunk(samples: FloatArray) {}

    fun types(): List<String> = events.map { it.first }
    fun of(type: String): List<Map<String, Any?>> = events.filter { it.first == type }.map { it.second }
}

private class OkTranscriber(private val text: String) : Transcriber {
    private var counter = 0
    override suspend fun transcribe(samples: FloatArray, startTime: Double, endTime: Double, assignId: Boolean): TranscriptSegment? {
        val id = if (assignId) ++counter else counter
        return TranscriptSegment(id = id, text = text, lang = "en", start = startTime, end = endTime)
    }
    override fun resetCounter(start: Int) { counter = start }
}

private class HungTranscriber : Transcriber {
    override suspend fun transcribe(samples: FloatArray, startTime: Double, endTime: Double, assignId: Boolean): TranscriptSegment? =
        awaitCancellation()
    override fun resetCounter(start: Int) {}
}

private class OkTranslator : Translator {
    override suspend fun translate(segment: TranscriptSegment): List<TranslationResult> =
        listOf(TranslationResult(segment.id, "t:${segment.text}", "vi"))
}

class TracingPipelineTest {
    // One 1024-byte chunk = 512 samples = one Silero frame = one detector decision.
    private fun finiteSource(chunks: Int): () -> Flow<ByteArray> = { flow { repeat(chunks) { emit(ByteArray(1024)) } } }

    /** Paced source: one 32ms frame per chunk in virtual time, [chunks] total. */
    private fun pacedSource(chunks: Int): () -> Flow<ByteArray> = {
        flow {
            repeat(chunks) {
                emit(ByteArray(1024))
                delay(32)
            }
        }
    }

    @Test
    fun tracesFullEventSequenceForTranscribedSegment() = runTest {
        val tracer = RecordingTracer()
        val pipeline = PipelineController(
            scope = this,
            audioSource = finiteSource(10),
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = OkTranscriber("hello"),
            translator = OkTranslator(),
            tracer = tracer,
            timeSource = testScheduler.timeSource,
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        assertEquals(1, tracer.sessions)
        assertEquals(1, tracer.sessionEnds)
        val types = tracer.types()
        for (expected in listOf("vad_speech_start", "segment", "asr_call", "asr_done", "translate_call", "translate_done")) {
            assertTrue(expected in types, "missing $expected in $types")
        }
        // Ordering: segment before its final asr_call before asr_done before translate_call.
        val finalCall = tracer.events.indexOfFirst { it.first == "asr_call" && it.second["kind"] == "final" }
        assertTrue(types.indexOf("segment") < finalCall)
        assertTrue(finalCall < types.indexOf("translate_done"))
        val done = tracer.of("asr_done").first { it["kind"] == "final" }
        assertEquals("hello", done["text"])
        assertEquals("hello".length, done["text_len"])
        assertEquals("en", done["lang"])
    }

    @Test
    fun tracesAsrError() = runTest {
        val tracer = RecordingTracer()
        val failing = object : Transcriber {
            override suspend fun transcribe(samples: FloatArray, startTime: Double, endTime: Double, assignId: Boolean): TranscriptSegment? =
                throw RuntimeException("boom")
            override fun resetCounter(start: Int) {}
        }
        val pipeline = PipelineController(
            scope = this,
            audioSource = finiteSource(10),
            detectorFactory = { FakeVoiceActivityDetector(List(10) { true }) },
            asr = failing,
            translator = OkTranslator(),
            tracer = tracer,
            timeSource = testScheduler.timeSource,
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        val errors = tracer.of("asr_error")
        assertTrue(errors.isNotEmpty())
        assertTrue((errors.first()["message"] as String).contains("boom"))
    }

    @Test
    fun emitsHeartbeatsWithStageState() = runTest {
        val tracer = RecordingTracer()
        val pipeline = PipelineController(
            scope = this,
            audioSource = pacedSource(100), // ~3.2s of audio in virtual time
            detectorFactory = { FakeVoiceActivityDetector() }, // content mode: zero bytes = silence
            asr = OkTranscriber("x"),
            translator = OkTranslator(),
            tracer = tracer,
            timeSource = testScheduler.timeSource,
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        val beats = tracer.of("heartbeat")
        assertTrue(beats.size >= 2, "expected >=2 heartbeats, got ${beats.size}")
        val beat = beats[1]
        assertTrue((beat["chunks"] as Int) > 0)
        assertEquals(false, beat["in_speech"])
        assertEquals(0, beat["inflight_asr"])
    }

    @Test
    fun stallFiresWhenSpeechGoesUnansweredDuringHungAsr() = runTest {
        val tracer = RecordingTracer()
        val pipeline = PipelineController(
            scope = this,
            // Long-running source: audio keeps flowing while ASR hangs.
            audioSource = pacedSource(2000),
            // 10 speech frames then silence → segment finalizes ~1s later, ASR hangs on it.
            detectorFactory = { FakeVoiceActivityDetector.of(speech = 10, silence = 5000) },
            asr = HungTranscriber(),
            translator = OkTranslator(),
            tracer = tracer,
            timeSource = testScheduler.timeSource,
        )

        pipeline.start()
        advanceTimeBy(20_000)

        val stalls = tracer.of("stall")
        assertEquals(1, stalls.size, "watchdog should fire exactly once within 20s (30s refire cap)")
        assertTrue((stalls.first()["unanswered_s"] as Double) >= 10.0)

        pipeline.stop()
    }

    @Test
    fun silenceDoesNotStall() = runTest {
        val tracer = RecordingTracer()
        val pipeline = PipelineController(
            scope = this,
            audioSource = pacedSource(600), // ~19s of silent audio
            detectorFactory = { FakeVoiceActivityDetector() },
            asr = HungTranscriber(),
            translator = OkTranslator(),
            tracer = tracer,
            timeSource = testScheduler.timeSource,
        )

        pipeline.start()
        advanceUntilIdle()
        pipeline.stop()

        assertTrue(tracer.of("stall").isEmpty(), "silence must not trigger the stall watchdog")
        assertTrue(tracer.of("heartbeat").isNotEmpty())
    }
}

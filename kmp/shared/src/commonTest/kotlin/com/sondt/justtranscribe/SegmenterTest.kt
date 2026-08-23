package com.sondt.justtranscribe

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SegmenterTest {
    private val frame = 512
    private val sr = 16000

    // 16 kHz: minSpeech 0.25s=4000 (>=8 frames), minSilence 1.0s=16000 (>=32 frames),
    // maxSpeech 15s=240000 (>=469 frames).
    private fun samples(frames: Int) = FloatArray(frames * frame)

    @Test
    fun emitsSegmentAfterMinSilence() {
        val speechFrames = 10
        val silenceFrames = 32 // 32*512=16384 >= 16000
        val det = FakeVoiceActivityDetector.of(speechFrames, silenceFrames)
        val seg = Segmenter(det)

        val out = seg.process(samples(speechFrames + silenceFrames))

        assertEquals(1, out.size)
        // The segment includes the trailing silence (faithful to the desktop/Flutter rule).
        assertEquals((speechFrames + silenceFrames) * frame, out[0].samples.size)
        assertEquals(0.0, out[0].startTime, 1e-9)
    }

    @Test
    fun doesNotEmitBeforeSilenceThreshold() {
        val det = FakeVoiceActivityDetector.of(speech = 10, silence = 30) // 30*512=15360 < 16000
        val seg = Segmenter(det)

        val out = seg.process(samples(40))

        assertTrue(out.isEmpty())
        // Still mid-utterance → interim audio available.
        assertNotNull(seg.pendingAudio())
    }

    @Test
    fun forceEmitsAtMaxDuration() {
        val speechFrames = 469 // 469*512=240128 >= 240000
        val det = FakeVoiceActivityDetector(List(speechFrames) { true })
        val seg = Segmenter(det)

        val out = seg.process(samples(speechFrames))

        assertEquals(1, out.size)
        assertTrue(out[0].samples.size >= 240000)
    }

    @Test
    fun flushEmitsTrailingSpeech() {
        val det = FakeVoiceActivityDetector(List(10) { true })
        val seg = Segmenter(det)

        val mid = seg.process(samples(10))
        assertTrue(mid.isEmpty()) // no silence yet

        val flushed = seg.flush()
        assertNotNull(flushed)
        assertEquals(10 * frame, flushed.samples.size)
        // State cleared after flush.
        assertNull(seg.pendingAudio())
    }

    @Test
    fun flushDiscardsTooShortSpeech() {
        val det = FakeVoiceActivityDetector(List(3) { true }) // 3*512=1536 < 4000
        val seg = Segmenter(det)

        seg.process(samples(3))

        assertNull(seg.flush())
    }

    @Test
    fun pendingAudioNullWhenIdle() {
        val det = FakeVoiceActivityDetector(List(5) { false })
        val seg = Segmenter(det)

        seg.process(samples(5))

        assertNull(seg.pendingAudio())
    }
}

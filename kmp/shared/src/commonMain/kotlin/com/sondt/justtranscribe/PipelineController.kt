package com.sondt.justtranscribe

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.sqrt
import kotlin.time.ComparableTimeMark
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeSource

/** ASR seam so the pipeline (and the Tier-1 harness) can run against a fake. */
interface Transcriber {
    suspend fun transcribe(
        samples: FloatArray,
        startTime: Double,
        endTime: Double,
        assignId: Boolean = true,
    ): TranscriptSegment?

    /** Reset the segment id counter so the next assigned id is `start + 1`. */
    fun resetCounter(start: Int = 0)
}

/** Translation seam so the pipeline (and the Tier-1 harness) can run against a fake. */
interface Translator {
    suspend fun translate(segment: TranscriptSegment): List<TranslationResult>
}

/**
 * Orchestrates capture → VAD/segmentation → ASR → translation and reduces every
 * event into a single [StateFlow] of [UiState]. This is the structural fix for the
 * Flutter app's crash/UI/state bugs: one immutable snapshot instead of four
 * `StreamController`s, and a [scope]-owned lifecycle instead of ad-hoc start/stop
 * races.
 *
 *  - [audioSource] is injectable: the mic in production, a WAV-derived flow in the
 *    Tier-1 harness.
 *  - [detectorFactory] yields a fresh (stateful) Silero detector per session,
 *    `close()`d on stop.
 *  - Final segments are transcribed serially via a channel so a slow ASR call
 *    applies backpressure to a finite source but never blocks indefinitely; the mic
 *    keeps being read because [stop] (not collection) owns teardown.
 *  - Every stage reports to [tracer] (always on; [NoopTracer] by default), including
 *    a 1/s heartbeat and a stall watchdog that fires when speech goes unanswered for
 *    [STALL_AFTER] while audio keeps flowing.
 */
class PipelineController(
    private val scope: CoroutineScope,
    private val audioSource: () -> Flow<ByteArray>,
    private val detectorFactory: () -> VoiceActivityDetector,
    private val asr: Transcriber,
    private val translator: Translator,
    private val autoGain: AutoGain = AutoGain(enabled = false),
    private val config: SegmenterConfig = SegmenterConfig(),
    private val tracer: Tracer = NoopTracer,
    private val timeSource: TimeSource.WithComparableMarks = TimeSource.Monotonic,
) {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var job: Job? = null
    private var detector: VoiceActivityDetector? = null
    private var segmenter: Segmenter? = null
    private var interimBusy = false

    // Diagnostics state, sampled by the heartbeat/watchdog ticker.
    private var chunksSinceBeat = 0
    private var lastRms = 0.0
    private var inFlightAsr = 0
    private var inFlightTranslations = 0
    private var lastInterimMark: ComparableTimeMark? = null
    private var lastFinalMark: ComparableTimeMark? = null
    private var unansweredSpeechMark: ComparableTimeMark? = null
    private var lastStallMark: ComparableTimeMark? = null

    val isRunning: Boolean get() = job?.isActive == true

    fun start() {
        if (job?.isActive == true) return
        autoGain.reset()
        resetDiagnostics()
        tracer.startSession()
        val det = detectorFactory().also { detector = it }
        val seg = Segmenter(det, config).also { segmenter = it }
        _state.update {
            it.copy(status = PipelineStatus.Recording, error = null, interimText = "", interimLang = "")
        }
        job = scope.launch {
            val channel = Channel<SpeechSegment>(Channel.UNLIMITED)
            val interim = launch { interimLoop(seg) }
            val heartbeat = launch { heartbeatLoop(seg) }
            val consumer = launch { for (s in channel) handleSegment(s) }
            try {
                audioSource().collect { bytes ->
                    val floats = autoGain.apply(pcm16ToFloat(bytes))
                    chunksSinceBeat++
                    lastRms = rms(floats)
                    tracer.onAudioChunk(floats)
                    val segments = seg.process(floats)
                    if (seg.isSpeaking && unansweredSpeechMark == null) {
                        unansweredSpeechMark = timeSource.markNow()
                    }
                    if (_state.value.speechActive != seg.isSpeaking) {
                        tracer.emit(if (seg.isSpeaking) "vad_speech_start" else "vad_speech_end")
                        _state.update { it.copy(speechActive = seg.isSpeaking) }
                    }
                    for (s in segments) channel.send(s)
                }
                // The source ended on its own (e.g. an injected WAV) → flush + drain.
                seg.flush()?.let { channel.send(it) }
                channel.close()
                consumer.join()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                // Capture/VAD/segmentation died (mic taken, ONNX failure, …): end the
                // session with an on-screen error instead of killing the process.
                failSession(e)
            } finally {
                interim.cancel()
                heartbeat.cancel()
                channel.close()
                consumer.cancel()
            }
        }
        // Net for failures the collect-path catch cannot see (a crashed child
        // coroutine cancels the parent instead of throwing into it).
        job?.invokeOnCompletion { cause ->
            if (cause != null && cause !is CancellationException) failSession(cause)
        }
    }

    /** Tear down after an in-session failure and surface it; safe to call twice. */
    private fun failSession(e: Throwable) {
        tracer.emit("pipeline_error", mapOf("message" to (e.message ?: e.toString())))
        runCatching { detector?.close() }
        detector = null
        segmenter = null
        _state.update {
            it.copy(
                status = PipelineStatus.Idle,
                speechActive = false,
                interimText = "",
                interimLang = "",
                error = "Recording stopped: ${e.message ?: e.toString()}",
            )
        }
        tracer.endSession()
    }

    /** Cancel the pipeline deterministically and flush the trailing segment. */
    suspend fun stop() {
        val j = job ?: return
        job = null
        _state.update { it.copy(status = PipelineStatus.Stopping) }
        j.cancelAndJoin()
        withContext(NonCancellable) {
            segmenter?.flush()?.let { seg -> runCatching { handleSegment(seg) } }
            detector?.close()
            tracer.endSession()
        }
        segmenter = null
        detector = null
        _state.update { it.copy(status = PipelineStatus.Idle, speechActive = false, interimText = "", interimLang = "") }
    }

    /**
     * Clear the visible transcript. When idle the segment id counter is also reset
     * so the next conversation starts at id 1; while recording the counter is left
     * alone so in-flight segments cannot collide with a restarted sequence.
     */
    fun clearTranscript() {
        if (!isRunning) asr.resetCounter()
        _state.update {
            it.copy(segments = emptyList(), translations = emptyMap(), interimText = "", interimLang = "", error = null)
        }
    }

    /**
     * Restore a persisted conversation into the UI state (idle only) and seed the
     * segment id counter past the highest restored id so appended segments stay
     * unique.
     */
    fun restore(snapshot: TranscriptSnapshot) {
        if (isRunning) return
        asr.resetCounter(snapshot.maxSegmentId)
        _state.update {
            it.copy(segments = snapshot.segments, translations = snapshot.translations, interimText = "", interimLang = "", error = null)
        }
    }

    /** Surface an externally-detected error (e.g. an unsupported mic sample rate) into the UI. */
    fun emitError(message: String) {
        tracer.emit("capture_error", mapOf("message" to message))
        _state.update { it.copy(error = message) }
    }

    private suspend fun handleSegment(speech: SpeechSegment) {
        val duration = speech.endTime - speech.startTime
        val wav = tracer.saveWav("seg", speech.samples)
        tracer.emit(
            "segment",
            mapOf("start" to speech.startTime, "end" to speech.endTime, "duration_s" to duration, "wav" to wav),
        )
        tracer.emit("asr_call", mapOf("kind" to "final", "audio_s" to duration))
        val t0 = timeSource.markNow()
        inFlightAsr++
        try {
            val transcript = asr.transcribe(speech.samples, speech.startTime, speech.endTime)
            unansweredSpeechMark = null
            lastFinalMark = timeSource.markNow()
            if (transcript == null) {
                tracer.emit(
                    "asr_done",
                    mapOf("kind" to "final", "latency_ms" to t0.elapsedNow().inWholeMilliseconds, "text_len" to 0),
                )
                return
            }
            tracer.emit(
                "asr_done",
                mapOf(
                    "kind" to "final",
                    "latency_ms" to t0.elapsedNow().inWholeMilliseconds,
                    "id" to transcript.id,
                    "text" to transcript.text,
                    "text_len" to transcript.text.length,
                    "lang" to transcript.lang,
                ),
            )
            _state.update {
                it.copy(
                    segments = it.segments + transcript,
                    interimText = "",
                    interimLang = "",
                    consecutiveFailures = 0,
                    error = null,
                )
            }
            // Translation runs off the segment path so it never blocks transcription.
            scope.launch {
                tracer.emit("translate_call", mapOf("id" to transcript.id))
                val tt0 = timeSource.markNow()
                inFlightTranslations++
                val results = try {
                    translator.translate(transcript)
                } catch (e: Throwable) {
                    tracer.emit(
                        "translate_error",
                        mapOf(
                            "id" to transcript.id,
                            "latency_ms" to tt0.elapsedNow().inWholeMilliseconds,
                            "message" to (e.message ?: e.toString()),
                        ),
                    )
                    emptyList()
                } finally {
                    inFlightTranslations--
                }
                if (results.isNotEmpty()) {
                    tracer.emit(
                        "translate_done",
                        mapOf(
                            "id" to transcript.id,
                            "latency_ms" to tt0.elapsedNow().inWholeMilliseconds,
                            "count" to results.size,
                        ),
                    )
                    _state.update { st -> st.copy(translations = st.translations + (transcript.id to results)) }
                }
            }
        } catch (e: Throwable) {
            tracer.emit(
                "asr_error",
                mapOf(
                    "kind" to "final",
                    "latency_ms" to t0.elapsedNow().inWholeMilliseconds,
                    "message" to (e.message ?: e.toString()),
                ),
            )
            _state.update {
                it.copy(error = "ASR error: ${e.message}", consecutiveFailures = it.consecutiveFailures + 1)
            }
        } finally {
            inFlightAsr--
        }
    }

    private suspend fun interimLoop(seg: Segmenter) {
        while (true) {
            delay(INTERIM_MS)
            if (interimBusy) continue
            val pending = seg.pendingAudio() ?: continue
            interimBusy = true
            val t0 = timeSource.markNow()
            inFlightAsr++
            try {
                val end = pending.size.toDouble() / config.sampleRate
                tracer.emit("asr_call", mapOf("kind" to "interim", "audio_s" to end))
                val t = asr.transcribe(pending, 0.0, end, assignId = false)
                unansweredSpeechMark = null
                lastInterimMark = timeSource.markNow()
                tracer.emit(
                    "asr_done",
                    mapOf(
                        "kind" to "interim",
                        "latency_ms" to t0.elapsedNow().inWholeMilliseconds,
                        "text_len" to (t?.text?.length ?: 0),
                    ),
                )
                if (t != null && t.text.isNotEmpty()) {
                    _state.update { it.copy(interimText = t.text, interimLang = t.lang) }
                }
            } catch (e: Throwable) {
                // interim failures are non-fatal
                tracer.emit(
                    "asr_error",
                    mapOf(
                        "kind" to "interim",
                        "latency_ms" to t0.elapsedNow().inWholeMilliseconds,
                        "message" to (e.message ?: e.toString()),
                    ),
                )
            } finally {
                inFlightAsr--
                interimBusy = false
            }
        }
    }

    /**
     * 1/s heartbeat + stall watchdog. Stall = audio chunks still flowing AND speech
     * has gone unanswered (no interim or final ASR response since it began) for
     * [STALL_AFTER]; silence never arms the clock, so a quiet user is not a stall.
     * Refires at most every [STALL_REFIRE].
     */
    private suspend fun heartbeatLoop(seg: Segmenter) {
        while (true) {
            delay(HEARTBEAT_MS)
            val chunks = chunksSinceBeat
            chunksSinceBeat = 0
            val snapshot = mapOf(
                "chunks" to chunks,
                "rms" to lastRms,
                "in_speech" to seg.isSpeaking,
                "inflight_asr" to inFlightAsr,
                "inflight_translate" to inFlightTranslations,
                "since_interim_s" to lastInterimMark?.elapsedNow()?.toDouble(kotlin.time.DurationUnit.SECONDS),
                "since_final_s" to lastFinalMark?.elapsedNow()?.toDouble(kotlin.time.DurationUnit.SECONDS),
            )
            tracer.emit("heartbeat", snapshot)
            val unanswered: Duration = unansweredSpeechMark?.elapsedNow() ?: continue
            val refireOk = lastStallMark?.let { it.elapsedNow() >= STALL_REFIRE } ?: true
            if (chunks > 0 && unanswered >= STALL_AFTER && refireOk) {
                lastStallMark = timeSource.markNow()
                tracer.emit(
                    "stall",
                    snapshot + mapOf("unanswered_s" to unanswered.toDouble(kotlin.time.DurationUnit.SECONDS)),
                )
            }
        }
    }

    private fun resetDiagnostics() {
        chunksSinceBeat = 0
        lastRms = 0.0
        lastInterimMark = null
        lastFinalMark = null
        unansweredSpeechMark = null
        lastStallMark = null
    }

    private fun rms(samples: FloatArray): Double {
        if (samples.isEmpty()) return 0.0
        var sum = 0.0
        for (s in samples) sum += s.toDouble() * s
        return sqrt(sum / samples.size)
    }

    /** Little-endian PCM16 → float (-1..1). */
    private fun pcm16ToFloat(bytes: ByteArray): FloatArray {
        val n = bytes.size / 2
        val out = FloatArray(n)
        var bi = 0
        for (i in 0 until n) {
            val lo = bytes[bi].toInt() and 0xFF
            val hi = bytes[bi + 1].toInt() and 0xFF
            var s = (hi shl 8) or lo
            if (s >= 32768) s -= 65536
            out[i] = s / 32768f
            bi += 2
        }
        return out
    }

    companion object {
        private const val INTERIM_MS = 500L
        private const val HEARTBEAT_MS = 1000L
        private val STALL_AFTER = 10.seconds
        private val STALL_REFIRE = 30.seconds
    }
}

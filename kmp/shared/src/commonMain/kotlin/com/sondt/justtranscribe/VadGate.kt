package com.sondt.justtranscribe

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow

/**
 * VAD stage that decorates the raw PCM capture flow. For each ~100 ms chunk it:
 *  1. slices the chunk into fixed [frameBytes]-byte Silero frames (PcmFramer),
 *  2. runs each frame through [detector]; the chunk is speech if any frame is,
 *  3. updates [speechState] (drives the UI icon),
 *  4. when [gatingEnabled], forwards only the chunks SpeechGate accepts, flushing a
 *     short pre-roll on onset; when gating is off it forwards every chunk but still
 *     updates [speechState].
 *
 * The mic flow is COLD and must be collected exactly once (a second collector would
 * start a second AudioRecord). This decorator collects its input once and re-emits,
 * so callers pass the result straight to AudioStreamer.
 *
 * @param frameBytes Silero frame size in bytes (512 samples * 2 bytes = 1024 at 16 kHz).
 */
class VadGate(
    private val detector: VoiceActivityDetector,
    config: VadConfig = VadConfig(),
    private val frameBytes: Int = 1024,
) {
    private val framer = PcmFramer(frameBytes)
    private val gate = SpeechGate(hangoverChunks = config.hangoverChunks)
    private val preRollCapacity = config.preRollChunks
    private val preRoll = ArrayDeque<ByteArray>(preRollCapacity + 1)

    private val _speechState = MutableStateFlow(false)
    val speechState: StateFlow<Boolean> = _speechState.asStateFlow()

    /**
     * Decorate [input], updating [speechState] and (when [gatingEnabled]) gating output.
     *
     * Call at most once per [VadGate] instance and collect the result once: instance
     * state ([framer], [gate], [preRoll]) is not reset between calls, so reuse would
     * emit corrupt output. Construct a fresh VadGate per streaming session.
     */
    fun gate(input: Flow<ByteArray>, gatingEnabled: Boolean): Flow<ByteArray> = flow {
        input.collect { chunk ->
            val hasSpeech = framer.frame(chunk).any { detector.isSpeech(it) }
            val decision = gate.process(hasSpeech)
            _speechState.value = decision.isSpeaking

            if (!gatingEnabled) {
                emit(chunk)
                return@collect
            }

            if (decision.forward) {
                if (decision.onset) {
                    while (preRoll.isNotEmpty()) emit(preRoll.removeFirst())
                }
                emit(chunk)
            } else if (preRollCapacity > 0) {
                preRoll.addLast(chunk)
                while (preRoll.size > preRollCapacity) preRoll.removeFirst()
            }
        }
    }
}

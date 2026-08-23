import 'package:flutter/foundation.dart';
import 'package:flutter_onnxruntime/flutter_onnxruntime.dart';

import '../models/speech_segment.dart';

/// Voice Activity Detection using Silero VAD ONNX model.
class VadService {
  static const int sampleRate = 16000;
  static const int chunkSamples = 512; // Required by Silero
  static const double speechThreshold = 0.5;
  static const double negThreshold = 0.35;
  static const double minSpeechS = 0.25;
  static const double minSilenceS = 2.0;
  static const double maxSpeechS = 30.0;

  final int _minSpeechSamples = (minSpeechS * sampleRate).toInt();
  final int _minSilenceSamples = (minSilenceS * sampleRate).toInt();
  final int _maxSpeechSamples = (maxSpeechS * sampleRate).toInt();

  final OnnxRuntime _ort = OnnxRuntime();
  OrtSession? _session;

  // ONNX model state tensor (v5: merged h+c into single state [2, 1, 128])
  Float32List _onnxState = Float32List(2 * 1 * 128);

  // Context buffer: Silero VAD requires the last 64 samples (16kHz) prepended to each chunk.
  // Without this, the model input shape is wrong and probabilities stay near zero.
  static const int _contextSize = 64; // 64 for 16kHz, 32 for 8kHz
  Float32List _context = Float32List(64);

  // Per-source state (mic only for mobile, but keep extensible)
  final Map<String, _SourceState> _sourceState = {};

  _SourceState _getState(String source) {
    return _sourceState.putIfAbsent(source, () => _SourceState());
  }

  /// Load the Silero VAD ONNX model from assets.
  Future<void> loadModel(String assetPath) async {
    _session = await _ort.createSessionFromAsset(assetPath);
    debugPrint('[JT] VAD model loaded from: $assetPath');
    debugPrint('[JT] VAD model inputs: ${_session!.inputNames}');
    debugPrint('[JT] VAD model outputs: ${_session!.outputNames}');
    debugPrint('[JT] VAD config: speechThresh=$speechThreshold negThresh=$negThreshold '
        'minSpeech=${minSpeechS}s minSilence=${minSilenceS}s maxSpeech=${maxSpeechS}s '
        'chunkSamples=$chunkSamples sampleRate=$sampleRate');
  }

  /// Check if a source currently has active speech.
  bool isSpeechActive(String source) {
    return _sourceState[source]?.inSpeech ?? false;
  }

  /// Get accumulated speech audio without clearing the buffer (for interim transcription).
  Float32List? getPendingAudio(String source) {
    final state = _sourceState[source];
    if (state == null || !state.inSpeech || state.speechBuffer.isEmpty) {
      return null;
    }
    final audio = _concatenate(state.speechBuffer);
    if (audio.length < _minSpeechSamples) return null;
    return audio;
  }

  /// Process a chunk of audio through VAD. Returns a SpeechSegment if one completes.
  Future<SpeechSegment?> processChunk(
    Float32List samples,
    String source,
    double streamTime,
  ) async {
    if (_session == null) {
      throw StateError('VAD model not loaded. Call loadModel() first.');
    }

    final state = _getState(source);
    state.buffer = _concat2(state.buffer, samples);

    while (state.buffer.length >= chunkSamples) {
      final chunk = Float32List.sublistView(state.buffer, 0, chunkSamples);
      state.buffer = Float32List.sublistView(state.buffer, chunkSamples);

      // Compute chunk amplitude for logging
      double chunkMax = 0;
      for (var i = 0; i < chunk.length; i++) {
        final abs = chunk[i].abs();
        if (abs > chunkMax) chunkMax = abs;
      }

      final prob = await _infer(chunk);
      state.totalSamples += chunkSamples;
      state.inferenceCount++;

      // Track max prob seen for debugging
      if (prob > state.maxProbSeen) state.maxProbSeen = prob;

      // Log first 10 inferences, then every 50th (~1.6s)
      if (state.inferenceCount <= 10 || state.inferenceCount % 50 == 0) {
        debugPrint('[JT] ④ VAD: inf#${state.inferenceCount} '
            'prob=${prob.toStringAsFixed(4)} '
            'chunkMax=${chunkMax.toStringAsFixed(4)} '
            'speech=${state.inSpeech} '
            'maxProbEver=${state.maxProbSeen.toStringAsFixed(4)} '
            'state[0..3]=${_onnxState[0].toStringAsFixed(4)},${_onnxState[1].toStringAsFixed(4)},${_onnxState[2].toStringAsFixed(4)},${_onnxState[3].toStringAsFixed(4)}');
      }

      final currentTime =
          streamTime - state.buffer.length / sampleRate;

      if (prob >= speechThreshold) {
        if (!state.inSpeech) {
          state.inSpeech = true;
          state.speechStartTime = currentTime;
          state.speechBuffer = [];
          debugPrint('[JT] ⑤ SPEECH START at t=${currentTime.toStringAsFixed(1)}s prob=${prob.toStringAsFixed(3)}');
        }
        state.speechBuffer.add(Float32List.fromList(chunk));
        state.silenceSamples = 0;

        // Force-emit if segment exceeds max duration
        final speechSamples =
            state.speechBuffer.fold<int>(0, (sum, b) => sum + b.length);
        if (speechSamples >= _maxSpeechSamples) {
          final audio = _concatenate(state.speechBuffer);
          final duration = audio.length / sampleRate;
          final startT = state.speechStartTime;
          state.inSpeech = false;
          state.silenceSamples = 0;
          state.speechBuffer = [];
          debugPrint('[JT] ⑤ SPEECH END (max duration) ${duration.toStringAsFixed(1)}s');
          return SpeechSegment(
            samples: audio,
            startTime: startT,
            endTime: startT + duration,
          );
        }
      } else {
        if (state.inSpeech) {
          state.speechBuffer.add(Float32List.fromList(chunk));
          state.silenceSamples += chunkSamples;

          if (state.silenceSamples >= _minSilenceSamples) {
            final audio = _concatenate(state.speechBuffer);
            final duration = audio.length / sampleRate;
            final startT = state.speechStartTime;
            state.inSpeech = false;
            state.silenceSamples = 0;
            state.speechBuffer = [];

            if (audio.length >= _minSpeechSamples) {
              debugPrint('[JT] ⑤ SPEECH END (silence) ${duration.toStringAsFixed(1)}s, ${audio.length} samples');
              return SpeechSegment(
                samples: audio,
                startTime: startT,
                endTime: startT + duration,
              );
            } else {
              debugPrint('[JT] ⑤ SPEECH DISCARDED (too short) ${audio.length} < $_minSpeechSamples samples');
            }
          }
        }
      }
    }
    return null;
  }

  /// Flush remaining speech for a source (call on stop).
  SpeechSegment? flush(String source, double streamTime) {
    final state = _getState(source);
    if (state.inSpeech && state.speechBuffer.isNotEmpty) {
      final audio = _concatenate(state.speechBuffer);
      if (audio.length >= _minSpeechSamples) {
        final duration = audio.length / sampleRate;
        final segment = SpeechSegment(
          samples: audio,
          startTime: state.speechStartTime,
          endTime: state.speechStartTime + duration,
        );
        state.inSpeech = false;
        state.speechBuffer = [];
        return segment;
      }
    }
    return null;
  }

  /// Reset all VAD state.
  void reset() {
    _sourceState.clear();
    _onnxState = Float32List(2 * 1 * 128);
    _context = Float32List(_contextSize);
    _inferCount = 0;
  }

  /// Dispose resources.
  Future<void> dispose() async {
    await _session?.close();
    _session = null;
  }

  int _inferCount = 0;

  /// Run Silero VAD v5 inference on a 512-sample chunk.
  ///
  /// CRITICAL: The model requires a context buffer prepended to each chunk.
  /// Input shape is [1, contextSize + chunkSamples] = [1, 64 + 512] = [1, 576].
  /// After inference, the last 64 samples become the context for the next call.
  /// Without this context, the model produces near-zero probabilities.
  Future<double> _infer(Float32List chunk) async {
    _inferCount++;

    // Prepend context to chunk: [context(64) | chunk(512)] = 576 samples
    final inputWithContext = Float32List(_contextSize + chunkSamples);
    inputWithContext.setRange(0, _contextSize, _context);
    inputWithContext.setRange(_contextSize, _contextSize + chunkSamples, chunk);

    final inputs = {
      'input': await OrtValue.fromList(
        Float32List.fromList(inputWithContext),
        [1, _contextSize + chunkSamples],
      ),
      'state': await OrtValue.fromList(Float32List.fromList(_onnxState), [2, 1, 128]),
      'sr': await OrtValue.fromList(Int64List.fromList([sampleRate]), [1]),
    };

    // Log first inference in detail
    if (_inferCount == 1) {
      debugPrint('[JT] ④ FIRST INFERENCE:');
      debugPrint('[JT]   input: ${inputWithContext.length} samples (ctx=$_contextSize + chunk=$chunkSamples)');
      debugPrint('[JT]   chunk min=${chunk.reduce((a, b) => a < b ? a : b).toStringAsFixed(5)}, '
          'max=${chunk.reduce((a, b) => a > b ? a : b).toStringAsFixed(5)}');
      debugPrint('[JT]   sr: $sampleRate (Int64)');
    }

    final outputs = await _session!.run(inputs);

    if (_inferCount == 1) {
      debugPrint('[JT]   output keys: ${outputs.keys.toList()}');
    }

    // Read output probability (shape [1, 1] flattened to [prob])
    final outputList = await outputs['output']!.asFlattenedList();
    final prob = (outputList[0] as num).toDouble();

    // Update ONNX hidden state (shape [2, 1, 128] flattened)
    final stateN = await outputs['stateN']!.asFlattenedList();
    _onnxState = Float32List.fromList(
      stateN.cast<double>().toList(),
    );

    // Update context with last 64 samples of the input
    _context = Float32List.sublistView(inputWithContext, inputWithContext.length - _contextSize);

    if (_inferCount == 1) {
      debugPrint('[JT]   prob=${prob.toStringAsFixed(6)}, type=${outputList[0].runtimeType}');
      debugPrint('[JT]   stateN: ${stateN.length} values, '
          'first4=${_onnxState[0].toStringAsFixed(4)},${_onnxState[1].toStringAsFixed(4)},${_onnxState[2].toStringAsFixed(4)},${_onnxState[3].toStringAsFixed(4)}');
    }

    // Cleanup
    for (final v in inputs.values) {
      v.dispose();
    }
    for (final v in outputs.values) {
      v.dispose();
    }

    return prob;
  }

  Float32List _concatenate(List<Float32List> buffers) {
    final totalLength = buffers.fold<int>(0, (sum, b) => sum + b.length);
    final result = Float32List(totalLength);
    var offset = 0;
    for (final buf in buffers) {
      result.setRange(offset, offset + buf.length, buf);
      offset += buf.length;
    }
    return result;
  }

  Float32List _concat2(Float32List a, Float32List b) {
    final result = Float32List(a.length + b.length);
    result.setRange(0, a.length, a);
    result.setRange(a.length, a.length + b.length, b);
    return result;
  }
}

class _SourceState {
  Float32List buffer = Float32List(0);
  bool inSpeech = false;
  double speechStartTime = 0.0;
  List<Float32List> speechBuffer = [];
  int silenceSamples = 0;
  int totalSamples = 0;
  int inferenceCount = 0;
  double maxProbSeen = 0.0;
}

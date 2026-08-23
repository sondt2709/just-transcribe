import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../models/transcript_segment.dart';
import '../models/translation_result.dart';
import '../models/speech_segment.dart';
import 'audio_capture_service.dart';
import 'vad_service.dart';
import 'asr_service.dart';
import 'translation_service.dart';

/// Pipeline orchestrator: audio capture -> VAD -> ASR -> translation.
class PipelineService {
  final AudioCaptureService _audio;
  final VadService _vad;
  final AsrService _asr;
  final TranslationService _translator;

  bool _running = false;
  double _startTime = 0;
  StreamSubscription? _audioSub;
  Timer? _interimTimer;
  bool _interimBusy = false;
  int _chunkCount = 0;

  /// Auto-gain: amplify low mic levels so VAD can detect speech.
  /// Silero VAD expects speech at 0.1–0.5 amplitude range.
  static const double _targetPeak = 0.3;
  static const double _maxGain = 40.0;
  double _currentGain = 10.0; // Start with 10x gain (mic typically gives ~0.01)

  // Event streams for UI
  final StreamController<TranscriptSegment> _segmentController =
      StreamController.broadcast();
  final StreamController<Map<String, String>> _interimController =
      StreamController.broadcast();
  final StreamController<TranslationResult> _translationController =
      StreamController.broadcast();
  final StreamController<String> _errorController =
      StreamController.broadcast();

  Stream<TranscriptSegment> get onSegment => _segmentController.stream;
  Stream<Map<String, String>> get onInterim => _interimController.stream;
  Stream<TranslationResult> get onTranslation => _translationController.stream;
  Stream<String> get onError => _errorController.stream;

  bool get isRunning => _running;

  PipelineService({
    required AudioCaptureService audio,
    required VadService vad,
    required AsrService asr,
    required TranslationService translator,
  })  : _audio = audio,
        _vad = vad,
        _asr = asr,
        _translator = translator;

  /// Start the pipeline: audio capture + VAD loop + interim loop.
  Future<void> start() async {
    if (_running) return;
    _running = true;
    _startTime = _now();
    _chunkCount = 0;
    _currentGain = 10.0;
    _asr.resetCounter();

    debugPrint('[JT] ═══════════════════════════════════════');
    debugPrint('[JT] PIPELINE START at ${DateTime.now().toIso8601String()}');
    debugPrint('[JT] ═══════════════════════════════════════');
    debugPrint('[JT] Initial gain: ${_currentGain.toStringAsFixed(1)}x');

    debugPrint('[JT] ① Starting audio capture...');
    await _audio.start();
    debugPrint('[JT] ① Audio capture started OK');

    // VAD processing loop
    _audioSub = _audio.audioStream.listen(
      (data) {
        _chunkCount++;
        _onAudioChunk(data);
      },
      onError: (e) {
        debugPrint('[JT] ① AUDIO STREAM ERROR: $e');
        _errorController.add('Audio error: $e');
      },
    );

    // Interim transcription loop (every 0.5s)
    _interimTimer = Timer.periodic(
      const Duration(milliseconds: 500),
      (_) => _onInterimTick(),
    );
    debugPrint('[JT] Pipeline: all loops started');
  }

  /// Stop the pipeline.
  Future<void> stop() async {
    if (!_running) return;
    _running = false;

    debugPrint('[JT] ═══════════════════════════════════════');
    debugPrint('[JT] PIPELINE STOP after $_chunkCount chunks');
    debugPrint('[JT] ═══════════════════════════════════════');

    _interimTimer?.cancel();
    _interimTimer = null;

    await _audioSub?.cancel();
    _audioSub = null;

    // Flush remaining VAD buffer
    final elapsed = _now() - _startTime;
    final segment = _vad.flush('mic', elapsed);
    if (segment != null) {
      debugPrint('[JT] ⑤ Flush: emitted final segment, ${segment.samples.length} samples');
      await _transcribeFinal(segment);
    }

    await _audio.stop();
    _vad.reset();
  }

  Future<void> dispose() async {
    await stop();
    await _segmentController.close();
    await _interimController.close();
    await _translationController.close();
    await _errorController.close();
  }

  void _onAudioChunk(Uint8List data) async {
    if (!_running) return;

    // ① RAW AUDIO: Log raw PCM16 bytes
    if (_chunkCount <= 5 || _chunkCount % 200 == 0) {
      // Show first few raw bytes to verify PCM16 format
      final preview = data.length >= 10
          ? data.sublist(0, 10).toList().toString()
          : data.toList().toString();
      debugPrint('[JT] ① Raw PCM16: chunk#$_chunkCount, ${data.length} bytes, first10=$preview');
    }

    // ② PCM16 → FLOAT32 CONVERSION
    final rawSamples = _pcm16ToFloat32(data);

    // Compute raw amplitude stats
    double rawMax = 0, rawSum = 0;
    int rawNonZero = 0;
    for (var i = 0; i < rawSamples.length; i++) {
      final abs = rawSamples[i].abs();
      if (abs > rawMax) rawMax = abs;
      rawSum += abs;
      if (abs > 0.0001) rawNonZero++;
    }
    final rawMean = rawSamples.isEmpty ? 0.0 : rawSum / rawSamples.length;

    if (_chunkCount <= 5 || _chunkCount % 200 == 0) {
      debugPrint('[JT] ② Float32: ${rawSamples.length} samples, '
          'max=${rawMax.toStringAsFixed(5)}, '
          'mean=${rawMean.toStringAsFixed(5)}, '
          'nonZero=$rawNonZero/${rawSamples.length}');
    }

    // ③ GAIN AMPLIFICATION
    // Adapt gain based on observed peak amplitude
    if (rawMax > 0.001) {
      // Smoothly adjust gain toward target
      final desiredGain = _targetPeak / rawMax;
      final clampedGain = desiredGain.clamp(1.0, _maxGain);
      // Exponential moving average for smooth transitions
      _currentGain = _currentGain * 0.95 + clampedGain * 0.05;
    }

    final amplified = Float32List(rawSamples.length);
    double ampMax = 0;
    for (var i = 0; i < rawSamples.length; i++) {
      var s = rawSamples[i] * _currentGain;
      // Soft clip to prevent distortion
      if (s > 1.0) s = 1.0;
      if (s < -1.0) s = -1.0;
      amplified[i] = s;
      final abs = s.abs();
      if (abs > ampMax) ampMax = abs;
    }

    if (_chunkCount <= 5 || _chunkCount % 200 == 0) {
      debugPrint('[JT] ③ Gain: ${_currentGain.toStringAsFixed(1)}x, '
          'pre-max=${rawMax.toStringAsFixed(5)}, '
          'post-max=${ampMax.toStringAsFixed(4)}');
    }

    // ④⑤ VAD PROCESSING
    final elapsed = _now() - _startTime;

    try {
      final segment = await _vad.processChunk(amplified, 'mic', elapsed);
      if (segment != null) {
        debugPrint('[JT] ⑤ VAD SEGMENT EMITTED: '
            '${segment.samples.length} samples, '
            '${segment.duration.toStringAsFixed(1)}s, '
            'start=${segment.startTime.toStringAsFixed(1)}s, '
            'end=${segment.endTime.toStringAsFixed(1)}s');
        await _transcribeFinal(segment);
      }
    } catch (e, st) {
      debugPrint('[JT] ④ VAD ERROR: $e\n$st');
      _errorController.add('VAD error: $e');
    }
  }

  void _onInterimTick() async {
    if (!_running || _interimBusy) return;

    final audio = _vad.getPendingAudio('mic');
    if (audio == null) return;

    _interimBusy = true;
    try {
      final elapsed = _now() - _startTime;
      debugPrint('[JT] Interim: sending ${audio.length} samples...');
      // Save and restore the counter so interim doesn't consume segment IDs
      final savedCounter = _asr.segmentCounter;
      final segment = await _asr.transcribe(
        audio,
        elapsed - audio.length / VadService.sampleRate,
        elapsed,
      );
      _asr.restoreCounter(savedCounter);
      if (segment != null && _running) {
        debugPrint('[JT] Interim result: "${segment.text}" (${segment.lang})');
        _interimController.add({
          'text': segment.text,
          'lang': segment.lang,
        });
      }
    } catch (e) {
      debugPrint('[JT] Interim error (non-fatal): $e');
    } finally {
      _interimBusy = false;
    }
  }

  Future<void> _transcribeFinal(SpeechSegment speech) async {
    try {
      final durationS = speech.samples.length / VadService.sampleRate;
      debugPrint('[JT] ⑥ ASR: sending ${speech.samples.length} samples '
          '(${durationS.toStringAsFixed(1)}s) to ${_asr.baseUrl}...');

      final sw = Stopwatch()..start();
      final segment = await _asr.transcribe(
        speech.samples,
        speech.startTime,
        speech.endTime,
      );
      sw.stop();

      if (segment == null) {
        debugPrint('[JT] ⑥ ASR: returned null (empty text) after ${sw.elapsedMilliseconds}ms');
        return;
      }

      debugPrint('[JT] ⑥ ASR RESULT: lang="${segment.lang}" '
          'text="${segment.text}" '
          'took=${sw.elapsedMilliseconds}ms');
      _segmentController.add(segment);

      // Trigger async translation
      final targets = _translator.getTranslationTargets(segment);
      if (targets.isNotEmpty) {
        debugPrint('[JT] ⑦ Translation: targets=$targets for segment#${segment.id}');
        _translateAsync(segment);
      } else {
        debugPrint('[JT] ⑦ Translation: no targets needed (lang=${segment.lang})');
      }
    } catch (e) {
      debugPrint('[JT] ⑥ ASR ERROR: $e');
      _errorController.add('ASR error: $e');
    }
  }

  void _translateAsync(TranscriptSegment segment) async {
    try {
      final sw = Stopwatch()..start();
      final results = await _translator.translateMulti(segment);
      sw.stop();
      for (final result in results) {
        debugPrint('[JT] ⑦ TRANSLATED: segment#${result.segmentId} '
            '→ ${result.targetLang}: "${result.translatedText}" '
            'took=${sw.elapsedMilliseconds}ms');
        _translationController.add(result);
      }
    } catch (e) {
      debugPrint('[JT] ⑦ Translation error (non-blocking): $e');
    }
  }

  /// Convert PCM16 little-endian bytes to Float32 samples.
  Float32List _pcm16ToFloat32(Uint8List bytes) {
    // Copy to ensure proper 2-byte alignment for Int16List
    final aligned = Uint8List.fromList(bytes);
    final int16 = aligned.buffer.asInt16List(0, aligned.length ~/ 2);
    final float32 = Float32List(int16.length);
    for (var i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  double _now() => DateTime.now().millisecondsSinceEpoch / 1000.0;
}

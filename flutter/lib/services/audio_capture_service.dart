import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

/// Wraps the record package for microphone PCM streaming.
class AudioCaptureService {
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Uint8List>? _subscription;
  final StreamController<Uint8List> _controller = StreamController.broadcast();

  /// Stream of raw PCM16 audio chunks from the microphone.
  Stream<Uint8List> get audioStream => _controller.stream;

  /// Request microphone permission using the record package's own check.
  Future<PermissionResult> requestPermission() async {
    final granted = await _recorder.hasPermission();
    debugPrint('[JT] AudioCapture: hasPermission=$granted');
    if (granted) {
      return PermissionResult.granted;
    }
    return PermissionResult.denied;
  }

  /// Start streaming PCM16 audio at 16kHz mono.
  Future<void> start() async {
    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
        autoGain: true,
        noiseSuppress: true,
        androidConfig: AndroidRecordConfig(
          audioSource: AndroidAudioSource.voiceRecognition,
          manageBluetooth: false,
        ),
      ),
    );
    debugPrint('[JT] AudioCapture: stream started');
    _subscription = stream.listen(
      (data) => _controller.add(data),
      onError: (error) {
        debugPrint('[JT] AudioCapture: stream error: $error');
        _controller.addError(error);
      },
    );
  }

  /// Stop recording and close the stream.
  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
    await _recorder.stop();
  }

  /// Dispose resources.
  Future<void> dispose() async {
    await stop();
    await _controller.close();
    _recorder.dispose();
  }
}

enum PermissionResult { granted, denied, permanentlyDenied }

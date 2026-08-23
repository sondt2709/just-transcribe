import 'dart:typed_data';

/// A detected speech segment from VAD.
class SpeechSegment {
  final Float32List samples;
  final double startTime;
  final double endTime;

  SpeechSegment({
    required this.samples,
    required this.startTime,
    required this.endTime,
  });

  double get duration => endTime - startTime;
}

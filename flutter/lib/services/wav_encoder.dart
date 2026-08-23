import 'dart:typed_data';

/// Encodes PCM float32 audio samples to a WAV byte buffer.
class WavEncoder {
  static const int _sampleRate = 16000;
  static const int _numChannels = 1;
  static const int _bitsPerSample = 16;

  /// Encode float32 samples to a WAV file in memory.
  static Uint8List encode(Float32List samples) {
    final int16Samples = _float32ToInt16(samples);
    final dataSize = int16Samples.lengthInBytes;
    final fileSize = 44 + dataSize;

    final buffer = ByteData(fileSize);
    var offset = 0;

    // RIFF header
    buffer.setUint8(offset++, 0x52); // R
    buffer.setUint8(offset++, 0x49); // I
    buffer.setUint8(offset++, 0x46); // F
    buffer.setUint8(offset++, 0x46); // F
    buffer.setUint32(offset, fileSize - 8, Endian.little);
    offset += 4;
    buffer.setUint8(offset++, 0x57); // W
    buffer.setUint8(offset++, 0x41); // A
    buffer.setUint8(offset++, 0x56); // V
    buffer.setUint8(offset++, 0x45); // E

    // fmt chunk
    buffer.setUint8(offset++, 0x66); // f
    buffer.setUint8(offset++, 0x6D); // m
    buffer.setUint8(offset++, 0x74); // t
    buffer.setUint8(offset++, 0x20); // (space)
    buffer.setUint32(offset, 16, Endian.little); // chunk size
    offset += 4;
    buffer.setUint16(offset, 1, Endian.little); // PCM format
    offset += 2;
    buffer.setUint16(offset, _numChannels, Endian.little);
    offset += 2;
    buffer.setUint32(offset, _sampleRate, Endian.little);
    offset += 4;
    buffer.setUint32(
      offset,
      _sampleRate * _numChannels * _bitsPerSample ~/ 8,
      Endian.little,
    ); // byte rate
    offset += 4;
    buffer.setUint16(
      offset,
      _numChannels * _bitsPerSample ~/ 8,
      Endian.little,
    ); // block align
    offset += 2;
    buffer.setUint16(offset, _bitsPerSample, Endian.little);
    offset += 2;

    // data chunk
    buffer.setUint8(offset++, 0x64); // d
    buffer.setUint8(offset++, 0x61); // a
    buffer.setUint8(offset++, 0x74); // t
    buffer.setUint8(offset++, 0x61); // a
    buffer.setUint32(offset, dataSize, Endian.little);
    offset += 4;

    // PCM data
    final bytes = buffer.buffer.asUint8List();
    bytes.setRange(offset, offset + dataSize, int16Samples.buffer.asUint8List());

    return bytes;
  }

  static Int16List _float32ToInt16(Float32List samples) {
    final result = Int16List(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i] * 32767.0;
      if (s > 32767) s = 32767;
      if (s < -32768) s = -32768;
      result[i] = s.toInt();
    }
    return result;
  }
}

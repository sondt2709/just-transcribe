import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../models/transcript_segment.dart';
import 'wav_encoder.dart';

/// Remote ASR service — transcribes audio via OpenAI-compatible HTTP API.
class AsrService {
  String baseUrl;
  String apiKey;
  String model;
  String language; // empty = auto-detect
  int _segmentCounter = 0;

  late Dio _dio;

  static const _retryableStatus = {429, 500, 502, 503};
  static const _requestTimeout = Duration(seconds: 30);
  static const _retryDelay = Duration(seconds: 1);

  AsrService({
    required this.baseUrl,
    this.apiKey = '',
    required this.model,
    this.language = '',
  }) {
    _dio = Dio(BaseOptions(
      connectTimeout: _requestTimeout,
      receiveTimeout: _requestTimeout,
    ));
  }

  void updateConfig({
    required String baseUrl,
    String apiKey = '',
    required String model,
    String language = '',
  }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
  }

  // Map full language names to codes (some ASR APIs return names instead of codes)
  static const _langNameToCode = {
    'english': 'en',
    'vietnamese': 'vi',
    'chinese': 'zh',
    'mandarin': 'zh',
    'cantonese': 'yue',
    'japanese': 'ja',
    'korean': 'ko',
    'french': 'fr',
    'german': 'de',
    'spanish': 'es',
    'portuguese': 'pt',
    'russian': 'ru',
    'thai': 'th',
    'indonesian': 'id',
    'malay': 'ms',
  };

  /// Normalize a language string to a short code.
  static String _normalizeLang(String? raw) {
    if (raw == null || raw.isEmpty) return 'unknown';
    final lower = raw.toLowerCase().trim();
    // Already a short code
    if (lower.length <= 3) return lower;
    // Map full name to code
    return _langNameToCode[lower] ?? lower;
  }

  /// Transcribe a speech segment. Returns null on empty result or failure.
  Future<TranscriptSegment?> transcribe(
    Float32List samples,
    double startTime,
    double endTime,
  ) async {
    final result = await _postTranscription(samples);
    if (result == null) return null;

    final text = (result['text'] as String? ?? '').trim();
    if (text.isEmpty) return null;

    final lang = _normalizeLang(result['language'] as String?);

    _segmentCounter++;
    return TranscriptSegment(
      id: _segmentCounter,
      text: text,
      source: 'mic',
      speaker: 'You',
      lang: lang,
      start: startTime,
      end: endTime,
    );
  }

  /// Test connectivity to a remote ASR server.
  /// Returns a map with `ok`, `models`, and `error` keys.
  Future<Map<String, dynamic>> testConnection(String url, {String apiKey = ''}) async {
    try {
      final headers = <String, String>{};
      if (apiKey.isNotEmpty) {
        headers['Authorization'] = 'Bearer $apiKey';
      }

      final base = url.replaceAll(RegExp(r'/+$'), '');
      final resp = await _dio.get(
        '$base/v1/models',
        options: Options(headers: headers),
      );

      final body = resp.data as Map<String, dynamic>;
      final modelList = (body['data'] ?? body['models'] ?? []) as List;
      final models = modelList
          .whereType<Map<String, dynamic>>()
          .where((m) => m.containsKey('id'))
          .map((m) => m['id'] as String)
          .toList();

      return {'ok': true, 'models': models};
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError) {
        return {'ok': false, 'error': 'Connection refused — is the server running?'};
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return {'ok': false, 'error': 'Connection timed out'};
      }
      if (e.response != null) {
        return {
          'ok': false,
          'error': 'HTTP ${e.response!.statusCode}: ${e.response!.data.toString().substring(0, 200.clamp(0, e.response!.data.toString().length))}'
        };
      }
      return {'ok': false, 'error': e.message ?? 'Unknown error'};
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> _postTranscription(Float32List samples) async {
    final base = baseUrl.replaceAll(RegExp(r'/+$'), '');
    final endpoint = '$base/v1/audio/transcriptions';
    final wavBytes = WavEncoder.encode(samples);

    final headers = <String, String>{};
    if (apiKey.isNotEmpty) {
      headers['Authorization'] = 'Bearer $apiKey';
    }

    for (var attempt = 0; attempt <= 1; attempt++) {
      try {
        final formData = FormData.fromMap({
          'file': MultipartFile.fromBytes(wavBytes, filename: 'segment.wav', contentType: DioMediaType('audio', 'wav')),
          'model': model,
          if (language.isNotEmpty) 'language': language,
        });

        final resp = await _dio.post(
          endpoint,
          data: formData,
          options: Options(headers: headers),
        );

        return resp.data as Map<String, dynamic>;
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        if (status != null &&
            _retryableStatus.contains(status) &&
            attempt < 1) {
          await Future.delayed(_retryDelay);
          continue;
        }
        rethrow;
      }
    }
    return null;
  }

  int get segmentCounter => _segmentCounter;

  void resetCounter() {
    _segmentCounter = 0;
  }

  void restoreCounter(int value) {
    _segmentCounter = value;
  }
}

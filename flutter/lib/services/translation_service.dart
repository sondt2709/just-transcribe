import 'dart:collection';

import 'package:dio/dio.dart';

import '../models/transcript_segment.dart';
import '../models/translation_result.dart';

const _langNames = {
  'en': 'English',
  'vi': 'Vietnamese',
  'zh': 'Chinese',
  'yue': 'Cantonese',
  'ja': 'Japanese',
  'ko': 'Korean',
};

/// Translates transcript segments via OpenAI-compatible chat API.
class TranslationService {
  String apiBase;
  String model;
  String apiKey;
  String preferredLanguage;
  String preferredLanguage2;

  final Queue<TranscriptSegment> _recentSegments = Queue();
  static const _maxContext = 3;

  late Dio _dio;

  TranslationService({
    this.apiBase = '',
    this.model = '',
    this.apiKey = '',
    this.preferredLanguage = 'en',
    this.preferredLanguage2 = '',
  }) {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ));
  }

  void updateConfig({
    required String apiBase,
    required String model,
    String apiKey = '',
    required String preferredLanguage,
    String preferredLanguage2 = '',
  }) {
    this.apiBase = apiBase;
    this.model = model;
    this.apiKey = apiKey;
    this.preferredLanguage = preferredLanguage;
    this.preferredLanguage2 = preferredLanguage2;
  }

  bool get isConfigured => apiBase.isNotEmpty && model.isNotEmpty;

  /// Return target languages that differ from the segment's detected language.
  List<String> getTranslationTargets(TranscriptSegment segment) {
    if (!isConfigured) return [];
    final segLang =
        segment.lang.toLowerCase().split('-').first;
    final targets = <String>[];
    for (final lang in [preferredLanguage, preferredLanguage2]) {
      if (lang.isEmpty) continue;
      if (lang.toLowerCase().split('-').first != segLang &&
          !targets.contains(lang)) {
        targets.add(lang);
      }
    }
    return targets;
  }

  /// Translate a segment to all applicable targets.
  Future<List<TranslationResult>> translateMulti(
    TranscriptSegment segment,
  ) async {
    final targets = getTranslationTargets(segment);
    if (targets.isEmpty) return [];

    _recentSegments.addLast(segment);
    while (_recentSegments.length > _maxContext + 1) {
      _recentSegments.removeFirst();
    }

    final futures = targets.map((lang) => _translateTo(segment, lang));
    final results = await Future.wait(futures);
    return results.whereType<TranslationResult>().toList();
  }

  Future<TranslationResult?> _translateTo(
    TranscriptSegment segment,
    String targetLang,
  ) async {
    final targetName = _langNames[targetLang] ?? targetLang;

    // Build context from recent segments (excluding current)
    final contextLines = <String>[];
    final recent = _recentSegments.toList();
    for (var i = 0; i < recent.length - 1; i++) {
      contextLines.add('[${recent[i].speaker}]: ${recent[i].text}');
    }

    var prompt =
        'Translate the following to $targetName. Output ONLY the translation, nothing else.';
    if (contextLines.isNotEmpty) {
      prompt +=
          '\n\nContext from the conversation:\n${contextLines.join('\n')}\n\nText to translate:';
    }

    try {
      final headers = <String, String>{'Content-Type': 'application/json'};
      if (apiKey.isNotEmpty) {
        headers['Authorization'] = 'Bearer $apiKey';
      }

      final base = apiBase.replaceAll(RegExp(r'/+$'), '');
      final resp = await _dio.post(
        '$base/v1/chat/completions',
        options: Options(headers: headers),
        data: {
          'model': model,
          'messages': [
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': segment.text},
          ],
          'temperature': 0.3,
          'max_tokens': 512,
        },
      );

      final data = resp.data as Map<String, dynamic>;
      final translated =
          (data['choices'][0]['message']['content'] as String).trim();

      return TranslationResult(
        segmentId: segment.id,
        translatedText: translated,
        targetLang: targetLang,
      );
    } catch (e) {
      // Translation failure is non-blocking
      return null;
    }
  }
}

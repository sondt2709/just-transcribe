/// A translation result for a transcript segment.
class TranslationResult {
  final int segmentId;
  final String translatedText;
  final String targetLang;

  TranslationResult({
    required this.segmentId,
    required this.translatedText,
    required this.targetLang,
  });
}

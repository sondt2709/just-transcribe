/// A finalized transcription result from ASR.
class TranscriptSegment {
  final int id;
  final String text;
  final String source;
  final String speaker;
  final String lang;
  final double start;
  final double end;

  TranscriptSegment({
    required this.id,
    required this.text,
    required this.source,
    required this.speaker,
    required this.lang,
    required this.start,
    required this.end,
  });
}

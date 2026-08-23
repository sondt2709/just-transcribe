import 'package:flutter_test/flutter_test.dart';
import 'package:just_transcribe/main.dart';

void main() {
  testWidgets('App loads without error', (WidgetTester tester) async {
    await tester.pumpWidget(const JustTranscribeApp());
    expect(find.text('Just Transcribe'), findsOneWidget);
  });
}

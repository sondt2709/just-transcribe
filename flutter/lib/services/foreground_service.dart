import 'package:flutter_foreground_task/flutter_foreground_task.dart';

/// Manages the Android foreground service for background audio recording.
class ForegroundService {
  static bool _initialized = false;

  /// Initialize the foreground task configuration. Call once at app startup.
  static void init() {
    if (_initialized) return;
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'transcription_service',
        channelName: 'Transcription Service',
        channelDescription: 'Active while recording and transcribing audio.',
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
    _initialized = true;
  }

  /// Start the foreground service with microphone type.
  static Future<bool> start() async {
    init();
    final result = await FlutterForegroundTask.startService(
      serviceId: 100,
      serviceTypes: [ForegroundServiceTypes.microphone],
      notificationTitle: 'Just Transcribe',
      notificationText: 'Recording and transcribing...',
      notificationButtons: [
        const NotificationButton(id: 'stop', text: 'Stop'),
      ],
      callback: _startCallback,
    );
    return result is ServiceRequestSuccess;
  }

  /// Stop the foreground service.
  static Future<bool> stop() async {
    final result = await FlutterForegroundTask.stopService();
    return result is ServiceRequestSuccess;
  }

  /// Update the notification text (e.g., to show segment count).
  static Future<void> updateNotification(String text) async {
    await FlutterForegroundTask.updateService(
      notificationTitle: 'Just Transcribe',
      notificationText: text,
    );
  }
}

// Top-level callback required by flutter_foreground_task.
// Runs in a separate isolate; we only use it to keep the service alive.
@pragma('vm:entry-point')
void _startCallback() {
  FlutterForegroundTask.setTaskHandler(_RecordingTaskHandler());
}

class _RecordingTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    // Service started — audio capture runs in the main isolate
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Periodic keepalive — no action needed
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    // Service destroyed
  }

  @override
  void onNotificationButtonPressed(String id) {
    if (id == 'stop') {
      // Send stop signal to main isolate
      FlutterForegroundTask.sendDataToMain({'action': 'stop'});
    }
  }

  @override
  void onNotificationPressed() {
    // Tap notification to return to app — handled automatically
  }
}

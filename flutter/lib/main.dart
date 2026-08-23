import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'models/app_config.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Transparent status bar for immersive feel
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF0a0a0a),
    ),
  );
  runApp(const JustTranscribeApp());
}

const _teal = Color(0xFF14b8a6);

class JustTranscribeApp extends StatelessWidget {
  const JustTranscribeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Just Transcribe',
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: _teal,
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF0a0a0a),
        cardColor: const Color(0xFF1a1a1a),
        dividerColor: const Color(0xFF404040),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF262626),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF404040)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF404040)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _teal),
          ),
          labelStyle: const TextStyle(color: Color(0xFFa1a1aa)),
          hintStyle: const TextStyle(color: Color(0xFF71717a)),
        ),
      ),
      // Light theme as fallback (same teal accent)
      theme: ThemeData(
        colorSchemeSeed: _teal,
        useMaterial3: true,
      ),
      home: const _AppLoader(),
    );
  }
}

class _AppLoader extends StatefulWidget {
  const _AppLoader();

  @override
  State<_AppLoader> createState() => _AppLoaderState();
}

class _AppLoaderState extends State<_AppLoader> {
  AppConfig? _config;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final config = await AppConfig.load();
    setState(() => _config = config);

    // First launch: navigate to settings if ASR not configured
    if (!config.isAsrConfigured && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => SettingsScreen(config: config),
          ),
        );
        // Rebuild HomeScreen with updated config after settings closes
        if (mounted) setState(() {});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_config == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return HomeScreen(config: _config!);
  }
}

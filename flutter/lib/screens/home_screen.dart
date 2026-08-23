import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import '../models/app_config.dart';
import '../models/transcript_segment.dart';
import '../models/translation_result.dart';
import '../services/audio_capture_service.dart';
import '../services/asr_service.dart';
import '../services/foreground_service.dart';
import '../services/pipeline_service.dart';
import '../services/translation_service.dart';
import '../services/vad_service.dart';
import 'settings_screen.dart';

// -- Colors matching Electron app --
const _bg = Color(0xFF0a0a0a);
const _surface = Color(0xFF1a1a1a);
const _surfaceAlt = Color(0xFF262626);
const _border = Color(0xFF404040);
const _textPrimary = Color(0xFFf5f5f5);
const _textSecondary = Color(0xFFd4d4d8);
const _textTertiary = Color(0xFFa1a1aa);
const _textMuted = Color(0xFF71717a);
const _textDim = Color(0xFF52525b);
const _teal = Color(0xFF14b8a6);
const _tealDim = Color(0x3314b8a6); // teal-500/20
const _red = Color(0xFFef4444);
const _redDim = Color(0x33ef4444);
const _indigo = Color(0xFF6366f1);
const _indigoDim = Color(0x1A6366f1); // indigo-500/10
const _indigoBorder = Color(0x336366f1); // indigo-500/20
const _indigoText = Color(0xFFa5b4fc); // indigo-200

const _langLabels = {
  'en': 'EN',
  'vi': 'VI',
  'zh': 'ZH',
  'yue': 'YUE',
  'ja': 'JA',
  'ko': 'KO',
};

const _asrLanguages = ['', 'en', 'vi', 'zh', 'yue', 'ja', 'ko'];
const _asrLangLabels = {
  '': 'Auto',
  'en': 'EN',
  'vi': 'VI',
  'zh': 'ZH',
  'yue': 'YUE',
  'ja': 'JA',
  'ko': 'KO',
};

class HomeScreen extends StatefulWidget {
  final AppConfig config;

  const HomeScreen({super.key, required this.config});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final ScrollController _scrollController = ScrollController();
  final List<_DisplaySegment> _segments = [];
  String _interimText = '';
  bool _recording = false;
  bool _userScrolledUp = false;
  int _consecutiveErrors = 0;

  late AudioCaptureService _audioCaptureService;
  late VadService _vadService;
  late AsrService _asrService;
  late TranslationService _translationService;
  PipelineService? _pipeline;

  final List<StreamSubscription> _subs = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ForegroundService.init();
    _audioCaptureService = AudioCaptureService();
    _vadService = VadService();
    _asrService = AsrService(
      baseUrl: widget.config.asrBaseUrl,
      apiKey: widget.config.asrApiKey,
      model: widget.config.asrModel,
      language: widget.config.asrLanguage,
    );
    _translationService = TranslationService(
      apiBase: widget.config.llmApiBase,
      model: widget.config.llmModel,
      apiKey: widget.config.llmApiKey,
      preferredLanguage: widget.config.preferredLanguage,
      preferredLanguage2: widget.config.preferredLanguage2,
    );
    _initVad();

    _scrollController.addListener(() {
      final atBottom = _scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 50;
      _userScrolledUp = !atBottom;
    });
  }

  Future<void> _initVad() async {
    try {
      await _vadService.loadModel('assets/silero_vad.onnx');
      debugPrint('[JT] VAD model loaded successfully');
    } catch (e, st) {
      debugPrint('[JT] VAD model load FAILED: $e\n$st');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final sub in _subs) {
      sub.cancel();
    }
    _pipeline?.dispose();
    _audioCaptureService.dispose();
    _vadService.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _syncConfig() {
    _asrService.updateConfig(
      baseUrl: widget.config.asrBaseUrl,
      apiKey: widget.config.asrApiKey,
      model: widget.config.asrModel,
      language: widget.config.asrLanguage,
    );
    _translationService.updateConfig(
      apiBase: widget.config.llmApiBase,
      model: widget.config.llmModel,
      apiKey: widget.config.llmApiKey,
      preferredLanguage: widget.config.preferredLanguage,
      preferredLanguage2: widget.config.preferredLanguage2,
    );
  }

  Future<void> _startRecording() async {
    final perm = await _audioCaptureService.requestPermission();
    if (perm != PermissionResult.granted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Microphone permission is required. Check app settings.'),
            duration: Duration(seconds: 5),
          ),
        );
      }
      return;
    }

    _syncConfig();
    _pipeline = PipelineService(
      audio: _audioCaptureService,
      vad: _vadService,
      asr: _asrService,
      translator: _translationService,
    );

    _subs.add(_pipeline!.onSegment.listen(_onSegment));
    _subs.add(_pipeline!.onInterim.listen(_onInterim));
    _subs.add(_pipeline!.onTranslation.listen(_onTranslation));
    _subs.add(_pipeline!.onError.listen(_onError));

    if (Platform.isAndroid) {
      await ForegroundService.start();
      FlutterForegroundTask.addTaskDataCallback(_onForegroundTaskData);
    }

    try {
      await _pipeline!.start();
      debugPrint('[JT] Pipeline started successfully');
    } catch (e, st) {
      debugPrint('[JT] Pipeline start FAILED: $e\n$st');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Start failed: $e'), duration: const Duration(seconds: 5)),
        );
      }
      return;
    }
    setState(() {
      _recording = true;
      _consecutiveErrors = 0;
    });
  }

  Future<void> _stopRecording() async {
    await _pipeline?.stop();
    if (Platform.isAndroid) {
      FlutterForegroundTask.removeTaskDataCallback(_onForegroundTaskData);
      await ForegroundService.stop();
    }
    for (final sub in _subs) {
      sub.cancel();
    }
    _subs.clear();
    setState(() {
      _recording = false;
      _interimText = '';
    });
  }

  void _onForegroundTaskData(Object data) {
    if (data is Map && data['action'] == 'stop') {
      _stopRecording();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!Platform.isIOS || !_recording) return;
    if (state == AppLifecycleState.paused) {
      _pipeline?.stop();
      if (mounted) {
        setState(() => _interimText = '(Paused — return to app to resume)');
      }
    } else if (state == AppLifecycleState.resumed) {
      _pipeline?.start();
      if (mounted) {
        setState(() => _interimText = '');
      }
    }
  }

  void _onSegment(TranscriptSegment segment) {
    setState(() {
      _segments.add(_DisplaySegment(segment: segment));
      _interimText = '';
      _consecutiveErrors = 0;
    });
    _autoScroll();
  }

  void _onInterim(Map<String, String> data) {
    setState(() {
      _interimText = data['text'] ?? '';
    });
    _autoScroll();
  }

  void _onTranslation(TranslationResult result) {
    setState(() {
      for (final ds in _segments) {
        if (ds.segment.id == result.segmentId) {
          ds.translations.add(result);
          break;
        }
      }
    });
    _autoScroll();
  }

  DateTime _lastErrorShown = DateTime(2000);

  void _onError(String message) {
    _consecutiveErrors++;
    if (_consecutiveErrors >= 3) {
      setState(() {});
    }
    final now = DateTime.now();
    if (now.difference(_lastErrorShown).inSeconds < 5) return;
    _lastErrorShown = now;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), duration: const Duration(seconds: 3)),
      );
    }
  }

  void _autoScroll() {
    if (_userScrolledUp) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _formatTime(double seconds) {
    final m = (seconds / 60).floor();
    final s = (seconds % 60).floor();
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _langLabel(String lang) {
    final code = lang.toLowerCase().split('-').first;
    return _langLabels[code] ?? code.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final canRecord = widget.config.isAsrConfigured;
    final safePadTop = MediaQuery.of(context).padding.top;

    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          // Status bar padding
          SizedBox(height: safePadTop),

          // Connection warning banner
          if (_consecutiveErrors >= 3)
            Container(
              width: double.infinity,
              color: const Color(0x33fbbf24), // amber/20
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: const Text(
                'Connection issues — transcription may be incomplete',
                style: TextStyle(color: Color(0xFFfbbf24), fontSize: 12),
              ),
            ),

          // Transcript area
          Expanded(
            child: _segments.isEmpty && _interimText.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.mic_none_rounded,
                          size: 48,
                          color: _textMuted.withAlpha(100),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          canRecord
                              ? 'Tap Start to begin transcribing'
                              : 'Configure ASR server in Settings',
                          style: const TextStyle(
                            color: _textMuted,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    itemCount: _segments.length + (_interimText.isNotEmpty ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index < _segments.length) {
                        return _buildSegmentTile(_segments[index]);
                      }
                      // Interim text
                      return Padding(
                        padding: const EdgeInsets.only(top: 4, left: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: _surfaceAlt,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                '...',
                                style: TextStyle(
                                  color: _textMuted,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _interimText,
                                style: const TextStyle(
                                  color: _textMuted,
                                  fontSize: 14,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),

          // Bottom control bar
          _buildBottomBar(canRecord),
        ],
      ),
    );
  }

  Widget _buildBottomBar(bool canRecord) {
    return Container(
      decoration: const BoxDecoration(
        color: _surface,
        border: Border(top: BorderSide(color: _border, width: 0.5)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Source language chips + settings
              Row(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: _asrLanguages.map((lang) {
                          final active = widget.config.asrLanguage == lang;
                          return Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  widget.config.asrLanguage = lang;
                                  widget.config.save();
                                  _syncConfig();
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: active ? _tealDim : _surfaceAlt,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: active ? _teal.withAlpha(77) : _border,
                                    width: 1,
                                  ),
                                ),
                                child: Text(
                                  _asrLangLabels[lang]!,
                                  style: TextStyle(
                                    color: active ? _teal : _textMuted,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                  // Settings button
                  IconButton(
                    icon: const Icon(Icons.settings_outlined, color: _textMuted, size: 20),
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => SettingsScreen(config: widget.config),
                        ),
                      );
                      _syncConfig();
                      setState(() {});
                    },
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Record button
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: canRecord
                      ? (_recording ? _stopRecording : _startRecording)
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _recording
                        ? _redDim
                        : (canRecord ? _teal : _surfaceAlt),
                    foregroundColor: _recording
                        ? _red
                        : (canRecord ? Colors.white : _textMuted),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: _recording
                          ? BorderSide(color: _red.withAlpha(77))
                          : BorderSide.none,
                    ),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _recording ? Icons.stop_rounded : Icons.mic_rounded,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _recording ? 'Stop' : 'Start',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSegmentTile(_DisplaySegment ds) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Speaker badge
          Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: ds.segment.source == 'mic' ? _tealDim : const Color(0x80404040),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              ds.segment.speaker,
              style: TextStyle(
                color: ds.segment.source == 'mic' ? _teal : _textTertiary,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Text + language label
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Expanded(
                      child: Text(
                        ds.segment.text,
                        style: const TextStyle(
                          color: _textPrimary,
                          fontSize: 14,
                          height: 1.5,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _langLabel(ds.segment.lang),
                      style: const TextStyle(
                        color: _textDim,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
                // Translations
                for (final tr in ds.translations)
                  Container(
                    margin: const EdgeInsets.only(top: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: _indigoDim,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _indigoBorder),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _langLabel(tr.targetLang),
                          style: TextStyle(
                            color: _indigo.withAlpha(180),
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            tr.translatedText,
                            style: const TextStyle(
                              color: _indigoText,
                              fontSize: 13,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          // Timestamp
          Padding(
            padding: const EdgeInsets.only(left: 6, top: 3),
            child: Text(
              _formatTime(ds.segment.start),
              style: const TextStyle(
                color: _textDim,
                fontSize: 10,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DisplaySegment {
  final TranscriptSegment segment;
  final List<TranslationResult> translations = [];

  _DisplaySegment({required this.segment});
}

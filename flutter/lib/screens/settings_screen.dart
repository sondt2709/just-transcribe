import 'package:flutter/material.dart';

import '../models/app_config.dart';
import '../services/asr_service.dart';

class SettingsScreen extends StatefulWidget {
  final AppConfig config;

  const SettingsScreen({super.key, required this.config});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _asrUrlCtl;
  late TextEditingController _asrKeyCtl;
  late TextEditingController _llmUrlCtl;
  late TextEditingController _llmKeyCtl;
  late TextEditingController _llmModelCtl;

  String _asrModel = '';
  List<String> _asrModels = [];
  String _asrLanguage = '';
  String _preferredLang = 'en';
  String _preferredLang2 = '';

  bool _testingAsr = false;
  String? _asrTestResult;
  bool _testingLlm = false;
  String? _llmTestResult;

  static const _languages = {
    '': 'Auto-detect',
    'en': 'English',
    'vi': 'Vietnamese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'yue': 'Cantonese',
  };

  @override
  void initState() {
    super.initState();
    final c = widget.config;
    _asrUrlCtl = TextEditingController(text: c.asrBaseUrl);
    _asrKeyCtl = TextEditingController(text: c.asrApiKey);
    _llmUrlCtl = TextEditingController(text: c.llmApiBase);
    _llmKeyCtl = TextEditingController(text: c.llmApiKey);
    _llmModelCtl = TextEditingController(text: c.llmModel);
    _asrModel = c.asrModel;
    _asrLanguage = c.asrLanguage;
    _preferredLang = c.preferredLanguage;
    _preferredLang2 = c.preferredLanguage2;
  }

  @override
  void dispose() {
    _asrUrlCtl.dispose();
    _asrKeyCtl.dispose();
    _llmUrlCtl.dispose();
    _llmKeyCtl.dispose();
    _llmModelCtl.dispose();
    super.dispose();
  }

  void _save() {
    final c = widget.config;
    c.asrBaseUrl = _asrUrlCtl.text.trim();
    c.asrApiKey = _asrKeyCtl.text.trim();
    c.asrModel = _asrModel;
    c.asrLanguage = _asrLanguage;
    c.llmApiBase = _llmUrlCtl.text.trim();
    c.llmApiKey = _llmKeyCtl.text.trim();
    c.llmModel = _llmModelCtl.text.trim();
    c.preferredLanguage = _preferredLang;
    c.preferredLanguage2 = _preferredLang2;
    c.save();
  }

  Future<void> _testAsrConnection() async {
    final url = _asrUrlCtl.text.trim();
    if (url.isEmpty) {
      setState(() => _asrTestResult = 'URL is required');
      return;
    }
    setState(() {
      _testingAsr = true;
      _asrTestResult = null;
    });

    final asr = AsrService(baseUrl: url, model: '');
    final result = await asr.testConnection(url, apiKey: _asrKeyCtl.text.trim());

    setState(() {
      _testingAsr = false;
      if (result['ok'] == true) {
        final models = (result['models'] as List<String>?) ?? [];
        _asrModels = models;
        _asrTestResult = 'Connected (${models.length} models)';
        if (models.isNotEmpty && _asrModel.isEmpty) {
          _asrModel = models.first;
          _save();
        }
      } else {
        _asrTestResult = result['error'] as String? ?? 'Connection failed';
      }
    });
  }

  Future<void> _testLlmConnection() async {
    final url = _llmUrlCtl.text.trim();
    if (url.isEmpty) {
      setState(() => _llmTestResult = 'URL is required');
      return;
    }
    setState(() {
      _testingLlm = true;
      _llmTestResult = null;
    });

    final asr = AsrService(baseUrl: url, model: '');
    final result = await asr.testConnection(url, apiKey: _llmKeyCtl.text.trim());

    setState(() {
      _testingLlm = false;
      _llmTestResult = result['ok'] == true
          ? 'Connected'
          : (result['error'] as String? ?? 'Connection failed');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // --- ASR Section ---
          Text('ASR Server', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _asrUrlCtl,
            decoration: const InputDecoration(
              labelText: 'Server URL',
              hintText: 'http://192.168.1.100:8000',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => _save(),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _asrKeyCtl,
            decoration: const InputDecoration(
              labelText: 'API Key (optional)',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
            onChanged: (_) => _save(),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: _testingAsr ? null : _testAsrConnection,
                  child: _testingAsr
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Test Connection'),
                ),
              ),
            ],
          ),
          if (_asrTestResult != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _asrTestResult!,
                style: TextStyle(
                  color: _asrTestResult!.startsWith('Connected')
                      ? Colors.green
                      : Colors.red,
                ),
              ),
            ),
          const SizedBox(height: 8),
          _asrModels.isNotEmpty
              ? DropdownButtonFormField<String>(
                  initialValue: _asrModels.contains(_asrModel) ? _asrModel : null,
                  decoration: const InputDecoration(
                    labelText: 'Model',
                    border: OutlineInputBorder(),
                  ),
                  items: _asrModels
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) {
                      _asrModel = v;
                      _save();
                    }
                  },
                )
              : TextField(
                  decoration: const InputDecoration(
                    labelText: 'Model',
                    hintText: 'Test connection to load models',
                    border: OutlineInputBorder(),
                  ),
                  controller: TextEditingController(text: _asrModel),
                  onChanged: (v) {
                    _asrModel = v.trim();
                    _save();
                  },
                ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _asrLanguage,
            decoration: const InputDecoration(
              labelText: 'ASR Language',
              border: OutlineInputBorder(),
            ),
            items: _languages.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: (v) {
              _asrLanguage = v ?? '';
              _save();
            },
          ),

          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 16),

          // --- LLM Section ---
          Text('Translation (LLM)', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _llmUrlCtl,
            decoration: const InputDecoration(
              labelText: 'LLM API URL',
              hintText: 'http://192.168.1.100:11434',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => _save(),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _llmKeyCtl,
            decoration: const InputDecoration(
              labelText: 'API Key (optional)',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
            onChanged: (_) => _save(),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _llmModelCtl,
            decoration: const InputDecoration(
              labelText: 'Model',
              hintText: 'e.g. llama3',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => _save(),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: _testingLlm ? null : _testLlmConnection,
                  child: _testingLlm
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Test Connection'),
                ),
              ),
            ],
          ),
          if (_llmTestResult != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _llmTestResult!,
                style: TextStyle(
                  color: _llmTestResult!.startsWith('Connected')
                      ? Colors.green
                      : Colors.red,
                ),
              ),
            ),

          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 16),

          // --- Language Preferences ---
          Text('Language Preferences', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _preferredLang,
            decoration: const InputDecoration(
              labelText: 'Preferred Language',
              border: OutlineInputBorder(),
            ),
            items: _languages.entries
                .where((e) => e.key.isNotEmpty)
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: (v) {
              _preferredLang = v ?? 'en';
              _save();
            },
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _preferredLang2,
            decoration: const InputDecoration(
              labelText: 'Secondary Language (optional)',
              border: OutlineInputBorder(),
            ),
            items: [
              const DropdownMenuItem(value: '', child: Text('None')),
              ..._languages.entries
                  .where((e) => e.key.isNotEmpty)
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))),
            ],
            onChanged: (v) {
              _preferredLang2 = v ?? '';
              _save();
            },
          ),

          const SizedBox(height: 48),
        ],
      ),
    );
  }
}

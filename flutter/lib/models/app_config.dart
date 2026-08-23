import 'package:shared_preferences/shared_preferences.dart';

/// User-configurable app settings, persisted via shared_preferences.
class AppConfig {
  String asrBaseUrl;
  String asrApiKey;
  String asrModel;
  String asrLanguage; // empty = auto-detect
  String llmApiBase;
  String llmApiKey;
  String llmModel;
  String preferredLanguage;
  String preferredLanguage2;

  AppConfig({
    this.asrBaseUrl = '',
    this.asrApiKey = '',
    this.asrModel = '',
    this.asrLanguage = '',
    this.llmApiBase = '',
    this.llmApiKey = '',
    this.llmModel = '',
    this.preferredLanguage = 'en',
    this.preferredLanguage2 = '',
  });

  bool get isAsrConfigured => asrBaseUrl.isNotEmpty && asrModel.isNotEmpty;
  bool get isLlmConfigured => llmApiBase.isNotEmpty && llmModel.isNotEmpty;

  static Future<AppConfig> load() async {
    final prefs = await SharedPreferences.getInstance();
    return AppConfig(
      asrBaseUrl: prefs.getString('asr_base_url') ?? '',
      asrApiKey: prefs.getString('asr_api_key') ?? '',
      asrModel: prefs.getString('asr_model') ?? '',
      asrLanguage: prefs.getString('asr_language') ?? '',
      llmApiBase: prefs.getString('llm_api_base') ?? '',
      llmApiKey: prefs.getString('llm_api_key') ?? '',
      llmModel: prefs.getString('llm_model') ?? '',
      preferredLanguage: prefs.getString('preferred_language') ?? 'en',
      preferredLanguage2: prefs.getString('preferred_language_2') ?? '',
    );
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('asr_base_url', asrBaseUrl);
    await prefs.setString('asr_api_key', asrApiKey);
    await prefs.setString('asr_model', asrModel);
    await prefs.setString('asr_language', asrLanguage);
    await prefs.setString('llm_api_base', llmApiBase);
    await prefs.setString('llm_api_key', llmApiKey);
    await prefs.setString('llm_model', llmModel);
    await prefs.setString('preferred_language', preferredLanguage);
    await prefs.setString('preferred_language_2', preferredLanguage2);
  }
}

package com.sondt.justtranscribe

/**
 * User-configurable settings (persisted on Android via DataStore). Mirrors the
 * Flutter `AppConfig`: remote ASR server, remote LLM server, and up to two
 * preferred translation languages. [asrLanguage] empty means auto-detect.
 *
 * Server URLs and API keys deliberately default to empty — the app ships no
 * endpoints. Model names default to the reference Qwen models.
 */
data class AppConfig(
    val asrBaseUrl: String = "",
    val asrApiKey: String = "",
    val asrModel: String = DEFAULT_ASR_MODEL,
    val asrLanguage: String = "",
    val llmApiBase: String = "",
    val llmApiKey: String = "",
    val llmModel: String = DEFAULT_LLM_MODEL,
    val preferredLanguage: String = "en",
    val preferredLanguage2: String = "",
    val debugAudio: Boolean = false,
) {
    val isAsrConfigured: Boolean get() = asrBaseUrl.isNotEmpty() && asrModel.isNotEmpty()
    val isLlmConfigured: Boolean get() = llmApiBase.isNotEmpty() && llmModel.isNotEmpty()

    companion object {
        const val DEFAULT_ASR_MODEL = "Qwen/Qwen3-ASR-1.7B"
        const val DEFAULT_LLM_MODEL = "Qwen/Qwen3-30B-A3B"
    }
}

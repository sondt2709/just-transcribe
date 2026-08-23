package com.sondt.justtranscribe

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** Persists [AppConfig] via Jetpack DataStore (replaces the Flutter `shared_preferences`). */
class SettingsStore(private val context: Context) {
    private object Keys {
        val asrBaseUrl = stringPreferencesKey("asr_base_url")
        val asrApiKey = stringPreferencesKey("asr_api_key")
        val asrModel = stringPreferencesKey("asr_model")
        val asrLanguage = stringPreferencesKey("asr_language")
        val llmApiBase = stringPreferencesKey("llm_api_base")
        val llmApiKey = stringPreferencesKey("llm_api_key")
        val llmModel = stringPreferencesKey("llm_model")
        val preferredLanguage = stringPreferencesKey("preferred_language")
        val preferredLanguage2 = stringPreferencesKey("preferred_language_2")
        val debugAudio = booleanPreferencesKey("debug_audio")
    }

    val configFlow: Flow<AppConfig> = context.dataStore.data.map { p ->
        AppConfig(
            asrBaseUrl = p[Keys.asrBaseUrl] ?: "",
            asrApiKey = p[Keys.asrApiKey] ?: "",
            asrModel = p[Keys.asrModel] ?: AppConfig.DEFAULT_ASR_MODEL,
            asrLanguage = p[Keys.asrLanguage] ?: "",
            llmApiBase = p[Keys.llmApiBase] ?: "",
            llmApiKey = p[Keys.llmApiKey] ?: "",
            llmModel = p[Keys.llmModel] ?: AppConfig.DEFAULT_LLM_MODEL,
            preferredLanguage = p[Keys.preferredLanguage] ?: "en",
            preferredLanguage2 = p[Keys.preferredLanguage2] ?: "",
            debugAudio = p[Keys.debugAudio] ?: false,
        )
    }

    suspend fun save(c: AppConfig) {
        context.dataStore.edit { p ->
            p[Keys.asrBaseUrl] = c.asrBaseUrl
            p[Keys.asrApiKey] = c.asrApiKey
            p[Keys.asrModel] = c.asrModel
            p[Keys.asrLanguage] = c.asrLanguage
            p[Keys.llmApiBase] = c.llmApiBase
            p[Keys.llmApiKey] = c.llmApiKey
            p[Keys.llmModel] = c.llmModel
            p[Keys.preferredLanguage] = c.preferredLanguage
            p[Keys.preferredLanguage2] = c.preferredLanguage2
            p[Keys.debugAudio] = c.debugAudio
        }
    }
}

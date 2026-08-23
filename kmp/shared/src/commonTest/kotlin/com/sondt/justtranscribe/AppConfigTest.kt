package com.sondt.justtranscribe

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class AppConfigTest {
    @Test
    fun freshConfigHasModelDefaultsAndNoEndpoints() {
        val c = AppConfig()
        assertEquals("Qwen/Qwen3-ASR-1.7B", c.asrModel)
        assertEquals("Qwen/Qwen3-30B-A3B", c.llmModel)
        assertEquals("", c.asrBaseUrl)
        assertEquals("", c.llmApiBase)
        assertEquals("", c.asrApiKey)
        assertEquals("", c.llmApiKey)
        // Model defaults alone must not mark the servers as configured.
        assertFalse(c.isAsrConfigured)
        assertFalse(c.isLlmConfigured)
    }

    @Test
    fun missingAsrFieldsNamesEmptyMandatoryFields() {
        assertEquals(listOf("ASR base URL"), AppConfig().missingAsrFields())
        assertEquals(
            listOf("ASR base URL", "ASR model"),
            AppConfig(asrModel = "").missingAsrFields(),
        )
        assertEquals(emptyList(), AppConfig(asrBaseUrl = "http://x", asrModel = "m").missingAsrFields())
    }
}

package com.sondt.justtranscribe

import kotlin.test.Test
import kotlin.test.assertEquals

class AsrClientTest {
    @Test
    fun normalizeLangHandlesCodesNamesAndEmpty() {
        assertEquals("unknown", AsrClient.normalizeLang(null))
        assertEquals("unknown", AsrClient.normalizeLang(""))
        assertEquals("en", AsrClient.normalizeLang("en"))
        assertEquals("en", AsrClient.normalizeLang("English"))
        assertEquals("zh", AsrClient.normalizeLang("MANDARIN"))
        assertEquals("vi", AsrClient.normalizeLang("  Vietnamese  "))
        assertEquals("fr", AsrClient.normalizeLang("fr"))
        // Unknown full name falls through lowercased.
        assertEquals("klingon", AsrClient.normalizeLang("Klingon"))
    }
}

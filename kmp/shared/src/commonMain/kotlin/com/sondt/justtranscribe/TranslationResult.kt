package com.sondt.justtranscribe

import kotlinx.serialization.Serializable

/** A translation of [segmentId]'s text into [targetLang]. */
@Serializable
data class TranslationResult(
    val segmentId: Int,
    val translatedText: String,
    val targetLang: String,
)

package com.sondt.justtranscribe

enum class PipelineStatus { Idle, Starting, Recording, Stopping }

/**
 * The single immutable UI state the pipeline emits as a `StateFlow`. This replaces
 * the Flutter app's four separate `StreamController`s (segment/interim/translation/
 * error) — the source of its UI/state glitches — with one snapshot Compose renders.
 *
 * @property translations keyed by `TranscriptSegment.id`.
 * @property consecutiveFailures drives the persistent warning after 3 failures.
 */
data class UiState(
    val status: PipelineStatus = PipelineStatus.Idle,
    val segments: List<TranscriptSegment> = emptyList(),
    val interimText: String = "",
    val interimLang: String = "",
    val translations: Map<Int, List<TranslationResult>> = emptyMap(),
    val speechActive: Boolean = false,
    val error: String? = null,
    val consecutiveFailures: Int = 0,
) {
    val isRunning: Boolean
        get() = status == PipelineStatus.Recording || status == PipelineStatus.Starting
}

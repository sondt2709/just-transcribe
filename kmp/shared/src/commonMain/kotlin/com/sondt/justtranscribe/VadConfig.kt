package com.sondt.justtranscribe

/**
 * Tunable parameters for the VAD stage. Defaults are sized for the PoC's ~100 ms
 * capture chunks at 16 kHz.
 *
 * @property preRollChunks chunks of audio replayed at speech onset so word onsets
 *   aren't clipped (1 ≈ 100 ms).
 * @property hangoverChunks consecutive silent chunks tolerated before declaring
 *   silence, trimming trailing silence without clipping word endings (4 ≈ 400 ms).
 */
data class VadConfig(
    val preRollChunks: Int = 1,
    val hangoverChunks: Int = 4,
)

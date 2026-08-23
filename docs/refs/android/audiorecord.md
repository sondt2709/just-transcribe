# Android AudioRecord — PCM capture cheatsheet

Sources (captured 2026-06-01):
- https://developer.android.com/reference/android/media/AudioRecord
- https://developer.android.com/reference/android/media/AudioFormat
- https://developer.android.com/ndk/guides/audio/sampling-audio.html

## Config for this PoC

- Source: `MediaRecorder.AudioSource.MIC`
- Channel: `AudioFormat.CHANNEL_IN_MONO`
- Encoding: `AudioFormat.ENCODING_PCM_16BIT` (signed 16-bit little-endian)
- Sample rate: **16000 Hz** preferred (works on virtually all modern hardware; ideal for ASR).
  Only **44100 Hz** is formally guaranteed on all devices — use it as fallback.

## Guarantees & pitfalls

- **Sample rate is not guaranteed at 16 kHz.** Probe with
  `AudioRecord.getMinBufferSize(rate, channel, encoding)` and treat
  `AudioRecord.ERROR` / `AudioRecord.ERROR_BAD_VALUE` as "unsupported" → fall back.
- **Permission:** `RECORD_AUDIO` must be declared in the manifest AND granted at
  runtime (API 23+) BEFORE constructing `AudioRecord`.
- **Threading:** `AudioRecord.read()` is blocking — run the loop off the main
  thread (`Dispatchers.IO`) or it will ANR.
- **Lifecycle ordering:** always `stop()` before `release()`. Never `release()` a
  recording instance without stopping first.
- **Source choice:** `MIC` gives a raw signal. `VOICE_COMMUNICATION` applies the
  built-in AEC/NS stack which alters the signal — avoid for a faithful PoC.

## Resolve a supported rate

```kotlin
private fun resolveSampleRate(): Int {
    for (rate in intArrayOf(16000, 44100)) {
        val mb = AudioRecord.getMinBufferSize(
            rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (mb != AudioRecord.ERROR && mb != AudioRecord.ERROR_BAD_VALUE) return rate
    }
    error("No supported PCM 16-bit mono sample rate on this device")
}
```

## Read loop (byte-array variant)

```kotlin
val minBuf = AudioRecord.getMinBufferSize(rate, CHANNEL_IN_MONO, ENCODING_PCM_16BIT)
val recorder = AudioRecord(MIC, rate, CHANNEL_IN_MONO, ENCODING_PCM_16BIT, maxOf(minBuf, 3200) * 2)
check(recorder.state == AudioRecord.STATE_INITIALIZED)
val buf = ByteArray(3200) // ~100ms @ 16kHz/16-bit mono
recorder.startRecording()
try {
    while (isActive) {
        val n = recorder.read(buf, 0, buf.size)
        if (n > 0) emit(buf.copyOf(n))
    }
} finally {
    recorder.stop()
    recorder.release()
}
```

`AudioRecord.read(byte[], offset, size)` returns bytes read (or a negative error
code). 16-bit PCM mono = 2 bytes/sample; 3200 bytes ≈ 1600 samples ≈ 100 ms at 16 kHz.

# ProGuard/R8 keep rules for a shrunk release build.
#
# Release currently builds with isMinifyEnabled = false (the POC-proven config),
# so these are not yet active. If you enable minify, verify on a device: R8 is
# known to strip the ONNX Runtime classes the Silero VAD loads via JNI/reflection
# (see docs/poc-design/E2E-RESULTS.md).

# ONNX Runtime (JNI / reflection).
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# android-vad Silero wrapper.
-keep class com.konovalov.vad.** { *; }

# kotlinx.serialization generated serializers.
-keepclassmembers class **$$serializer { *; }
-keep,includedescriptorclasses class com.sondt.justtranscribe.**$$serializer { *; }
-keepclassmembers class com.sondt.justtranscribe.** {
    *** Companion;
}

# Ktor + OkHttp ship their own consumer rules; silence optional-dependency warnings.
-dontwarn org.slf4j.**
-dontwarn okhttp3.internal.**

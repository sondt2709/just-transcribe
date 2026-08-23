# ONNX Runtime - keep all native methods and JNI classes
-keep class ai.onnxruntime.** { *; }
-keepclassmembers class ai.onnxruntime.** { *; }

# Flutter ONNX Runtime plugin
-keep class com.example.flutter_onnxruntime.** { *; }

# Keep native method names
-keepclasseswithmembernames class * {
    native <methods>;
}

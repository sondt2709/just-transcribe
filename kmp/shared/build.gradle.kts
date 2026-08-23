plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.androidLibrary)
}

kotlin {
    // NOTE: AGP-9 migration would replace androidTarget {} + the android {} block
    // below with the com.android.kotlin.multiplatform.library plugin's
    // androidLibrary {} block. Staying on AGP 8.x here for stability.
    androidTarget {
        compilations.all {
            compileTaskProvider.configure {
                compilerOptions {
                    jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
                }
            }
        }
    }

    sourceSets {
        commonMain.dependencies {
            // `api`, not `implementation`: platformHttpClient() returns
            // io.ktor.client.HttpClient as part of the shared module's public API,
            // so consumers (androidApp -> MainActivity) need it on their compile
            // classpath. coroutines is `api` too since pcmFrames() exposes Flow.
            api(libs.ktor.client.core)
            implementation(libs.ktor.client.websockets)
            api(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.ktor.client.mock)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
            implementation(libs.android.vad.silero)
        }
    }
}

android {
    namespace = "com.sondt.justtranscribe.shared"
    compileSdk = libs.versions.compileSdk.get().toInt()
    defaultConfig {
        minSdk = libs.versions.minSdk.get().toInt()
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

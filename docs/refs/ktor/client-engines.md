# Ktor Client Engines (Ktor 3.5.0) — OkHttp focus

Source: https://ktor.io/docs/client-engines.html (captured 2026-06-01)

The Ktor client is multiplatform; each platform needs an engine. For Android use **OkHttp** (or CIO). The legacy `Android` engine does NOT support WebSockets.

## Min versions

| Engine | Android | Java |
|--------|---------|------|
| OkHttp | 5.0+ | 8+ |
| CIO | 7.0+ (needs Java 8 desugaring on older) | 8+ |
| Android | 1.x+ | 8+ |

## OkHttp engine

Dependency:
```kotlin
implementation("io.ktor:ktor-client-okhttp:$ktor_version")
```

Construct + configure:
```kotlin
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*

val client = HttpClient(OkHttp) {
    engine {
        // this: OkHttpConfig
        config {
            // this: okhttp3.OkHttpClient.Builder
            followRedirects(true)
            pingInterval(java.time.Duration.ofSeconds(20)) // keep-alive for WebSockets
        }
        // addInterceptor(interceptor)
        // addNetworkInterceptor(interceptor)
        // preconfigured = okHttpClientInstance
        // duplexStreamingEnabled = true  // HTTP/2 only
    }
}
```

`OkHttpClient.Builder.pingInterval` accepts either `(long, TimeUnit)` or a `java.time.Duration`.

## Multiplatform engine selection (expect/actual pattern)

`commonMain` declares an `expect fun` returning a configured client; each platform provides the engine:

```kotlin
// commonMain
expect fun httpClient(config: HttpClientConfig<*>.() -> Unit = {}): HttpClient

// androidMain
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import java.util.concurrent.TimeUnit
actual fun httpClient(config: HttpClientConfig<*>.() -> Unit) = HttpClient(OkHttp) {
    config(this)
    engine { config { retryOnConnectionFailure(true) } }
}

// iosMain (future)
import io.ktor.client.engine.darwin.*
actual fun httpClient(config: HttpClientConfig<*>.() -> Unit) = HttpClient(Darwin) {
    config(this)
    engine { configureRequest { setAllowsCellularAccess(true) } }
}
```

This is the pattern our PoC's `HttpClientFactory` follows (Android = OkHttp now; Darwin slots in later for iOS).

package com.sondt.justtranscribe

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.WebSockets
import java.util.concurrent.TimeUnit

actual fun platformHttpClient(): HttpClient = HttpClient(OkHttp) {
    install(WebSockets)
    install(HttpTimeout)
    // NOTE: the OkHttp engine ignores WebSockets.Config.pingIntervalMillis — the
    // keep-alive ping MUST be set on the OkHttp builder via engine { config { } }.
    // (See docs/refs/ktor/client-engines.md.)
    engine {
        config {
            pingInterval(20, TimeUnit.SECONDS)
        }
    }
}

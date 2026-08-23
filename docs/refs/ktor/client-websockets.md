# Ktor Client WebSockets (Ktor 3.5.0)

Source: https://ktor.io/docs/client-websockets.html (captured 2026-06-01)

## Dependency

```kotlin
implementation("io.ktor:ktor-client-websockets:$ktor_version")
```

## Install the plugin

```kotlin
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.websocket.*

val client = HttpClient(OkHttp) {
    install(WebSockets)
}
```

## Configuration (`WebSockets.Config`)

- `maxFrameSize` — max Frame size that can be sent/received.
- `contentConverter` — serialization converter.
- `pingIntervalMillis` (Long) / `pingInterval` (Duration) — duration between pings.

> ⚠️ **IMPORTANT:** `pingInterval` / `pingIntervalMillis` are **NOT applicable to the OkHttp engine**.
> For OkHttp, set the ping interval via the engine config instead (see `client-engines.md`):
> ```kotlin
> HttpClient(OkHttp) {
>     install(WebSockets)
>     engine { config { pingInterval(20, java.util.concurrent.TimeUnit.SECONDS) } }
> }
> ```

## Working with sessions

A client session is a `DefaultClientWebSocketSession`. Access via:

```kotlin
client.webSocket(method = HttpMethod.Get, host = "127.0.0.1", port = 8080, path = "/echo") {
    // this: DefaultClientWebSocketSession
}
```

Or `client.webSocketSession(...)` to hold the session outside a block.

Inside the block:
- `send()` — send text content.
- `outgoing` — channel for sending `Frame`s.
- `incoming` — channel for receiving `Frame`s.
- `close()` — send a close frame with a reason.

## Frame types

- `Frame.Text` — text frame; read with `Frame.Text.readText()`.
- `Frame.Binary` — binary frame; read with `Frame.Binary.readBytes()`.
- `Frame.Close` — closing frame; reason via `Frame.Close.readReason()`.

> For **binary** sends you must wrap explicitly: `send(Frame.Binary(fin = true, data = byteArray))`.
> `send(byteArray)` does not exist; `send(string)` is the text-frame convenience.

## Engine WebSocket support (Limitations table)

| Engine | WebSockets |
|--------|-----------|
| Apache5 | ✖️ |
| Java | ✅ |
| Jetty | ✖️ |
| CIO | ✅ |
| Android | ✖️ |
| **OkHttp** | ✅ |
| Js | ✅ |
| Darwin | ✅ |
| WinHttp | ✅ |
| Curl | ✅ |

Note: the legacy `Android` engine does **not** support WebSockets — use **OkHttp** (or CIO) on Android.

## Example

```kotlin
fun main() {
    val client = HttpClient(CIO) {
        install(WebSockets) { pingIntervalMillis = 20_000 } // CIO honors this; OkHttp does not
    }
    runBlocking {
        client.webSocket(method = HttpMethod.Get, host = "127.0.0.1", port = 8080, path = "/echo") {
            while (true) {
                val othersMessage = incoming.receive() as? Frame.Text
                println(othersMessage?.readText())
                send(Scanner(System.`in`).next())
            }
        }
    }
    client.close()
}
```

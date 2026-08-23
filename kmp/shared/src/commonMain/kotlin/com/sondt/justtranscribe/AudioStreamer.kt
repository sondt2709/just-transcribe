package com.sondt.justtranscribe

import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.HttpMethod
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json

/**
 * Opens a WebSocket to ws://host:port/stream, sends the JSON handshake as a text
 * frame, then streams PCM chunks from [frames] as binary frames until the flow
 * completes or the coroutine is cancelled. [frames] may be the raw capture flow or
 * a VAD-gated flow — AudioStreamer is a pure transport and doesn't care which.
 */
class AudioStreamer(private val client: HttpClient) {

    suspend fun stream(host: String, port: Int, sampleRate: Int, frames: Flow<ByteArray>) {
        val config = StreamConfig(sampleRate = sampleRate)
        client.webSocket(method = HttpMethod.Get, host = host, port = port, path = "/stream") {
            send(Frame.Text(Json.encodeToString(config)))
            try {
                frames.collect { chunk ->
                    send(Frame.Binary(fin = true, data = chunk))
                }
            } finally {
                // Ensure the server always sees a NORMAL close, even if collect
                // throws or a send fails mid-stream.
                close(CloseReason(CloseReason.Codes.NORMAL, "done"))
            }
        }
    }
}

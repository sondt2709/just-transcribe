package com.sondt.justtranscribe

import io.ktor.client.HttpClient

/** Creates a platform HttpClient with the WebSockets plugin installed. */
expect fun platformHttpClient(): HttpClient

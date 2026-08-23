# Local reference docs

Offline copies of the official references that back the design and implementation
plan, so implementing agents can read them locally without web access.
Captured 2026-06-01. Versions pinned: Kotlin 2.3.21, Ktor 3.5.0, AGP 8.13.2.

## Kotlin Multiplatform & language (`kotlin/`)
Per-page LLM-optimized text from kotlinlang.org `/docs/_llms`.

- `multiplatform-discover-project.txt` — KMP project structure basics
- `multiplatform-hierarchy.txt` — hierarchical source sets
- `multiplatform-expect-actual.txt` — expect/actual declarations (core to our AudioCapture/HttpClient)
- `multiplatform-add-dependencies.txt` — adding deps to source sets
- `multiplatform-project-agp-9-migration.txt` — AGP 9 migration (we stay on AGP 8.x; this is the future path)
- `gradle-configure-project.txt` — Gradle config
- `serialization.txt` — kotlinx.serialization (StreamConfig handshake)
- `coroutines-basics.txt` — coroutines
- `flow.txt` — Flow (AudioCapture.pcmFrames returns a Flow)
- `android-overview.txt` — Kotlin for Android

## Full guides (top level)
- `kmp-llms.txt` — full Kotlin Multiplatform dev guide (jetbrains.com/help/kotlin-multiplatform-dev), single bundle
- `kotlin-llms.txt` — index of all kotlinlang.org per-page `.txt` references (for fetching more)

## Ktor (`ktor/`) — curated from ktor.io 3.5.0
- `client-websockets.md` — WebSocket client API, frame types, **OkHttp ping caveat**
- `client-engines.md` — engine selection; OkHttp config + multiplatform expect/actual engine pattern

## Android (`android/`) — curated from developer.android.com
- `audiorecord.md` — PCM 16-bit capture, sample-rate fallback, threading & lifecycle pitfalls

## Key correctness notes distilled here
1. **OkHttp ignores `pingIntervalMillis`** on the WebSockets plugin — set it via
   `engine { config { pingInterval(...) } }`. (ktor/client-engines.md)
2. **Binary sends need `Frame.Binary(fin=true, data=...)`** — no `send(ByteArray)`. (ktor/client-websockets.md)
3. **The legacy `Android` engine has no WebSocket support** — use OkHttp. (ktor/client-engines.md)
4. **16 kHz is not guaranteed**; probe `getMinBufferSize`, fall back to 44.1 kHz. (android/audiorecord.md)
5. **AGP 9 + KMP** requires `com.android.kotlin.multiplatform.library`; we use AGP 8.13.2 to avoid it. (kotlin/multiplatform-project-agp-9-migration.txt)

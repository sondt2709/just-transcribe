package com.sondt.justtranscribe

import android.app.Application
import android.app.backup.BackupManager
import android.content.Context
import android.util.Log
import com.sondt.justtranscribe.debug.FileTracer
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class JustTranscribeApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

/** Convenience accessor for the process-wide [AppContainer]. */
val Context.container: AppContainer
    get() = (applicationContext as JustTranscribeApp).container

/**
 * Process-wide wiring: HTTP client, settings, ASR/translation clients, and the
 * single [PipelineController] whose [state] the UI observes. The pipeline runs in
 * [scope] (process-lifetime); the foreground service keeps the process alive while
 * recording with the screen off.
 */
class AppContainer(private val appContext: Context) {
    // Last-resort net: anything a pipeline/persist coroutine failed to handle is
    // logged instead of killing the process. State repair belongs to the pipeline.
    private val crashNet = CoroutineExceptionHandler { _, e ->
        Log.e("JustTranscribe", "Uncaught coroutine failure", e)
    }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + crashNet)

    private val http = platformHttpClient()
    private val settingsStore = SettingsStore(appContext)

    val config: StateFlow<AppConfig> =
        settingsStore.configFlow.stateIn(scope, SharingStarted.Eagerly, AppConfig())

    private val asr = AsrClient(http, config.value)
    private val translator = TranslationClient(http, config.value)
    val tracer = FileTracer(appContext, scope) { config.value }

    private val pipeline = PipelineController(
        scope = scope,
        audioSource = { AudioCapture().pcmFrames() },
        detectorFactory = { AndroidVoiceActivityDetector(appContext) },
        asr = asr,
        translator = translator,
        autoGain = AutoGain(enabled = false),
        tracer = tracer,
    )

    val state: StateFlow<UiState> = pipeline.state
    val isRunning: Boolean get() = pipeline.isRunning

    private val transcriptStore = TranscriptStore(appContext)
    private val _hasHistory = MutableStateFlow(false)

    /** True when a previous conversation is on disk and resumable. */
    val hasHistory: StateFlow<Boolean> = _hasHistory.asStateFlow()

    @OptIn(FlowPreview::class)
    private fun persistLoop() = scope.launch {
        state
            .map { TranscriptSnapshot(it.segments, it.translations) }
            .distinctUntilChanged()
            .debounce(500)
            // Empty snapshots are never persisted here: deletion happens only via
            // clearTranscript(), so a fresh launch cannot wipe resumable history.
            .collect { snap -> if (!snap.isEmpty) persist(snap) }
    }

    private suspend fun persist(snap: TranscriptSnapshot) {
        transcriptStore.save(snap)
        _hasHistory.value = true
    }

    init {
        scope.launch { _hasHistory.value = transcriptStore.hasSnapshot() }
        persistLoop()
        scope.launch {
            config.collect { c ->
                asr.updateConfig(c)
                translator.updateConfig(c)
                tracer.debugAudio = c.debugAudio
            }
        }
    }

    /** Start the pipeline, guarding the 16 kHz requirement of the Silero detector. */
    fun requestStart() {
        if (AudioCapture().sampleRate != 16000) {
            pipeline.emitError("Microphone does not support 16 kHz capture — required for on-device VAD.")
            return
        }
        pipeline.start()
    }

    fun requestStop() {
        scope.launch {
            pipeline.stop()
            // Flush without waiting for the debounce so disk matches the screen.
            val s = state.value
            val snap = TranscriptSnapshot(s.segments, s.translations)
            if (!snap.isEmpty) persist(snap)
        }
    }

    /** Clear the visible transcript and delete persisted history (no confirmation by design). */
    fun clearTranscript() {
        pipeline.clearTranscript()
        scope.launch {
            transcriptStore.clear()
            _hasHistory.value = false
        }
    }

    /**
     * Load the persisted conversation into the idle pipeline and seed the
     * translation context. Returns false when there is nothing to restore.
     */
    suspend fun restoreHistory(): Boolean {
        val snap = transcriptStore.load() ?: return false
        pipeline.restore(snap)
        translator.seedContext(snap.segments)
        return true
    }

    suspend fun saveConfig(c: AppConfig) {
        settingsStore.save(c)
        // Queue a key-value backup pass so a reinstall restores this save,
        // not whatever stale snapshot Auto Backup uploaded last.
        BackupManager(appContext).dataChanged()
    }

    suspend fun testConnection(url: String, apiKey: String) = asr.testConnection(url, apiKey)
}

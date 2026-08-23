@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.sondt.justtranscribe.debug

import android.media.MediaPlayer
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import java.io.File

/**
 * Debug sessions browser: list of today's recorded sessions → chronological
 * important-event view with inline WAV playback and zip export via the share sheet.
 * Retention is automatic (daily, see [DebugSessions]) — no manual cleanup here.
 */
@Composable
fun DebugSessionsScreen(onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var sessions by remember { mutableStateOf<List<SessionMeta>?>(null) }
    var totalBytes by remember { mutableStateOf(0L) }
    var audioBytes by remember { mutableStateOf(0L) }
    var selected by remember { mutableStateOf<SessionMeta?>(null) }
    var confirmDeleteAudio by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        sessions = DebugSessionRepo.listSessions(context)
        totalBytes = DebugSessionRepo.totalStorageBytes(context)
        audioBytes = DebugSessionRepo.audioStorageBytes(context)
    }

    val open = selected
    if (open != null) {
        SessionDetailScreen(meta = open, onBack = { selected = null })
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Debug sessions") },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Text(
                "Sessions from today · ${DebugSessionRepo.formatSize(totalBytes)} used · older days are cleaned automatically",
                Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (audioBytes > 0) {
                TextButton(
                    onClick = { confirmDeleteAudio = true },
                    modifier = Modifier.padding(horizontal = 8.dp),
                ) {
                    Text(
                        "Delete all debug audio (${DebugSessionRepo.formatSize(audioBytes)})",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            if (confirmDeleteAudio) {
                AlertDialog(
                    onDismissRequest = { confirmDeleteAudio = false },
                    title = { Text("Delete all debug audio?") },
                    text = { Text("Removes every WAV from every session (${DebugSessionRepo.formatSize(audioBytes)}). Trace logs are kept.") },
                    confirmButton = {
                        TextButton(onClick = {
                            confirmDeleteAudio = false
                            scope.launch {
                                DebugSessionRepo.deleteAllAudio(context)
                                reloadKey++
                            }
                        }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                    },
                    dismissButton = {
                        TextButton(onClick = { confirmDeleteAudio = false }) { Text("Cancel") }
                    },
                )
            }
            when {
                sessions == null -> Loading()
                sessions!!.isEmpty() -> Text(
                    "No sessions recorded today. Start a recording to create one.",
                    Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(sessions!!, key = { it.name }) { meta ->
                        SessionRow(
                            meta = meta,
                            onOpen = { selected = meta },
                            onShare = { scope.launch { DebugSessionRepo.shareSession(context, meta.dir) } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SessionRow(meta: SessionMeta, onOpen: () -> Unit, onShare: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Row(
            Modifier.clickable(onClick = onOpen).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(meta.name.substringAfter('_').replace('-', ':'), style = MaterialTheme.typography.titleMedium)
                Text(
                    "%.0fs · %d events · %s".format(
                        java.util.Locale.US, meta.durationS, meta.eventCount, DebugSessionRepo.formatSize(meta.sizeBytes),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (meta.errorCount > 0 || meta.stallCount > 0) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (meta.errorCount > 0) Badge("${meta.errorCount} errors", MaterialTheme.colorScheme.error)
                        if (meta.stallCount > 0) Badge("${meta.stallCount} stalls", MaterialTheme.colorScheme.tertiary)
                    }
                }
            }
            IconButton(onClick = onShare) {
                Icon(Icons.Filled.Share, contentDescription = "Share session")
            }
        }
    }
}

@Composable
private fun Badge(text: String, color: androidx.compose.ui.graphics.Color) {
    Surface(shape = MaterialTheme.shapes.small, color = color.copy(alpha = 0.15f)) {
        Text(
            text,
            Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

@Composable
private fun SessionDetailScreen(meta: SessionMeta, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<SessionDetail?>(null) }
    var expanded by remember { mutableStateOf<Int?>(null) }
    var playingWav by remember { mutableStateOf<String?>(null) }
    val player = remember { MediaPlayer() }

    DisposableEffect(Unit) { onDispose { player.release() } }
    LaunchedEffect(meta.dir) { detail = DebugSessionRepo.loadDetail(meta.dir) }

    fun togglePlay(wav: String) {
        if (playingWav == wav) {
            player.stop()
            playingWav = null
            return
        }
        runCatching {
            player.reset()
            player.setDataSource(File(meta.dir, wav).absolutePath)
            player.setOnCompletionListener { playingWav = null }
            player.prepare()
            player.start()
            playingWav = wav
        }.onFailure { playingWav = null }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(meta.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { scope.launch { DebugSessionRepo.shareSession(context, meta.dir) } }) {
                        Icon(Icons.Filled.Share, contentDescription = "Share session")
                    }
                },
            )
        },
    ) { padding ->
        val d = detail
        if (d == null) {
            Column(Modifier.padding(padding)) { Loading() }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(padding).fillMaxSize()) {
            item {
                Text(
                    "%d heartbeats (max gap %.1fs) · %d interim ASR calls".format(
                        java.util.Locale.US, d.heartbeatCount, d.maxBeatGapS, d.interimCount,
                    ),
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            items(d.events.size) { i ->
                val e = d.events[i]
                EventRow(
                    event = e,
                    expanded = expanded == i,
                    playing = playingWav != null && playingWav == e.wav,
                    onClick = { expanded = if (expanded == i) null else i },
                    onPlay = e.wav?.let { wav -> { togglePlay(wav) } },
                )
            }
        }
    }
}

@Composable
private fun EventRow(
    event: SessionEvent,
    expanded: Boolean,
    playing: Boolean,
    onClick: () -> Unit,
    onPlay: (() -> Unit)?,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .animateContentSize(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                wallClock(event.tsMs),
                Modifier.width(64.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TypeChip(event.type)
            Spacer(Modifier.width(8.dp))
            Text(
                event.summary,
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodySmall,
                maxLines = if (expanded) 10 else 1,
            )
            if (onPlay != null) {
                IconButton(onClick = onPlay) {
                    Icon(
                        if (playing) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                        contentDescription = if (playing) "Stop" else "Play audio",
                    )
                }
            }
        }
        if (expanded) {
            Text(
                event.raw,
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(start = 64.dp, top = 4.dp),
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            )
        }
    }
}

@Composable
private fun TypeChip(type: String) {
    val (label, color) = when (type) {
        "session_start", "session_end" -> "session" to MaterialTheme.colorScheme.primary
        "vad_speech_start", "vad_speech_end" -> "vad" to MaterialTheme.colorScheme.secondary
        "segment" -> "segment" to MaterialTheme.colorScheme.secondary
        "asr_call", "asr_done" -> "asr" to MaterialTheme.colorScheme.primary
        "asr_error", "translate_error", "capture_error" -> "error" to MaterialTheme.colorScheme.error
        "translate_call", "translate_done" -> "llm" to MaterialTheme.colorScheme.tertiary
        "stall" -> "stall" to MaterialTheme.colorScheme.error
        else -> type to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Badge(label, color)
}

private fun wallClock(tsMs: Long): String =
    java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date(tsMs))

@Composable
private fun Loading() {
    Row(
        Modifier.fillMaxWidth().padding(24.dp),
        horizontalArrangement = Arrangement.Center,
    ) { CircularProgressIndicator() }
}

@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.sondt.justtranscribe

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    state: UiState,
    configured: Boolean,
    missingFields: List<String>,
    hasHistory: Boolean,
    onToggle: () -> Unit,
    onResume: () -> Unit,
    onClear: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val listState = rememberLazyListState()
    val footerCount = if (state.interimText.isNotEmpty()) 1 else 0
    val total = state.segments.size + footerCount
    LaunchedEffect(total, state.interimText) {
        if (total > 0) listState.animateScrollToItem(total - 1)
    }

    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val copy: (String) -> Unit = { text ->
        context.getSystemService(ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("transcript", text))
        // API 33+ shows the system clipboard overlay; older versions get a snackbar.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            scope.launch { snackbar.showSnackbar("Copied") }
        }
    }
    val hasTranscript = state.segments.isNotEmpty() || state.interimText.isNotEmpty()
    val exportText = { TranscriptExporter.format(state.segments, state.translations) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Just Transcribe") },
                actions = {
                    IconButton(onClick = { copy(exportText()) }, enabled = state.segments.isNotEmpty()) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = "Copy transcript")
                    }
                    IconButton(
                        onClick = {
                            val send = Intent(Intent.ACTION_SEND)
                                .setType("text/plain")
                                .putExtra(Intent.EXTRA_TEXT, exportText())
                            context.startActivity(Intent.createChooser(send, "Share transcript"))
                        },
                        enabled = state.segments.isNotEmpty(),
                    ) {
                        Icon(Icons.Filled.Share, contentDescription = "Share transcript")
                    }
                    if (configured) {
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Filled.Settings, contentDescription = "Settings")
                        }
                    } else {
                        // Highlighted while unconfigured: this is the fix path.
                        FilledIconButton(onClick = onOpenSettings) {
                            Icon(Icons.Filled.Settings, contentDescription = "Settings")
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                if (!configured) {
                    OnboardingCard(missingFields, onOpenSettings)
                }
                if (state.consecutiveFailures >= 3) {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Repeated failures — ${state.error ?: "check the server and network"}",
                            Modifier.padding(12.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    // Extra bottom padding lets the last card scroll above the record controls.
                    contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 120.dp),
                ) {
                    items(state.segments, key = { it.id }) { seg ->
                        SegmentCard(seg, state.translations[seg.id].orEmpty(), onCopy = copy)
                    }
                    if (state.interimText.isNotEmpty()) {
                        item { InterimRow(state.interimText) }
                    }
                }
            }
            RecordControls(
                state = state,
                configured = configured,
                showClear = hasTranscript,
                showResume = hasHistory && !state.isRunning && state.segments.isEmpty(),
                onToggle = onToggle,
                onResume = onResume,
                onClear = onClear,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
            )
        }
    }
}

/**
 * Bottom control cluster: fixed-width side slots keep the big record button
 * exactly centered (equal reach for either hand) whatever else is visible.
 */
@Composable
private fun RecordControls(
    state: UiState,
    configured: Boolean,
    showClear: Boolean,
    showResume: Boolean,
    onToggle: () -> Unit,
    onResume: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
            if (showClear) {
                FilledTonalIconButton(onClick = onClear) {
                    Icon(Icons.Filled.DeleteSweep, contentDescription = "Clear transcript")
                }
            }
        }
        Spacer(Modifier.width(20.dp))
        FilledIconButton(
            onClick = onToggle,
            enabled = configured,
            modifier = Modifier.size(80.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = if (state.isRunning) {
                    MaterialTheme.colorScheme.errorContainer
                } else {
                    MaterialTheme.colorScheme.primaryContainer
                },
                contentColor = if (state.isRunning) {
                    MaterialTheme.colorScheme.onErrorContainer
                } else {
                    MaterialTheme.colorScheme.onPrimaryContainer
                },
            ),
        ) {
            if (state.isRunning) {
                SpeakingBars(
                    active = state.speechActive,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            } else {
                Icon(
                    Icons.Filled.Mic,
                    contentDescription = "Record",
                    modifier = Modifier.size(36.dp),
                )
            }
        }
        Spacer(Modifier.width(20.dp))
        Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
            if (showResume) {
                FilledTonalIconButton(onClick = onResume) {
                    Icon(Icons.Filled.History, contentDescription = "Resume previous conversation")
                }
            }
        }
    }
}

/**
 * Google Meet-style speaking indicator: three vertical bars that bounce with
 * staggered phases while [active]; static short dots when silent. Doubles as the
 * stop icon on the recording button.
 */
@Composable
private fun SpeakingBars(active: Boolean, color: Color, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "speaking")
    val phases = listOf(0, 160, 320).map { offset ->
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 500, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
                initialStartOffset = StartOffset(offset),
            ),
            label = "bar",
        )
    }
    Row(
        modifier.height(32.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        phases.forEach { phase ->
            val height = if (active) 10.dp + 18.dp * phase.value else 8.dp
            Box(
                Modifier
                    .width(6.dp)
                    .height(height)
                    .clip(RoundedCornerShape(3.dp))
                    .background(color),
            )
        }
    }
}

/**
 * Neutral onboarding card shown until the ASR server is configured — a welcome,
 * not an error: nothing is wrong, the user just hasn't set up yet.
 */
@Composable
private fun OnboardingCard(missingFields: List<String>, onOpenSettings: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(16.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text("Welcome to Just Transcribe", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text(
                "Live transcription runs against your own ASR server. " +
                    "To get started, set up the ${missingFields.joinToString(" and the ")}.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = onOpenSettings) { Text("Open Settings") }
        }
    }
}

@Composable
private fun SegmentCard(
    seg: TranscriptSegment,
    translations: List<TranslationResult>,
    onCopy: (String) -> Unit,
) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    seg.speaker,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(8.dp))
                LangBadge(seg.lang)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                seg.text,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.fillMaxWidth().clickable { onCopy(seg.text) },
            )
            translations.forEach { tr ->
                Spacer(Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { onCopy(tr.translatedText) },
                ) {
                    LangBadge(tr.targetLang)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        tr.translatedText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun LangBadge(lang: String) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = RoundedCornerShape(4.dp),
    ) {
        Text(
            lang.uppercase(),
            Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
        )
    }
}

@Composable
private fun InterimRow(text: String) {
    Text(
        text,
        Modifier.fillMaxWidth().padding(8.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontStyle = FontStyle.Italic,
    )
}

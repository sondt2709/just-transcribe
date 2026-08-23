package com.sondt.justtranscribe

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sondt.justtranscribe.debug.DebugSessionsScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private var pendingStart = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { _ ->
        val micGranted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (pendingStart && micGranted) {
            pendingStart = false
            TranscribeService.start(this)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val activity = this
        setContent {
            JustTranscribeTheme {
                AppRoot(
                    container = container,
                    onStart = { requestThenStart() },
                    onStop = { TranscribeService.stop(activity) },
                )
            }
        }
    }

    private fun requestThenStart() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.RECORD_AUDIO)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isEmpty()) {
            TranscribeService.start(this)
        } else {
            pendingStart = true
            permissionLauncher.launch(needed.toTypedArray())
        }
    }
}

// Branded fallback schemes for API < 31 (no Material You), built from the
// m2.material.io Teal palette to match the Electron accent and launcher icon.
// Only the roles this UI uses are overridden; neutrals/error keep M3 defaults.
private val LightTealScheme = lightColorScheme(
    primary = Color(0xFF00796B), // Teal 700
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFB2DFDB), // Teal 100
    onPrimaryContainer = Color(0xFF004D40), // Teal 900
    secondary = Color(0xFF00695C), // Teal 800
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE0F2F1), // Teal 50
    onSecondaryContainer = Color(0xFF004D40), // Teal 900
)

private val DarkTealScheme = darkColorScheme(
    primary = Color(0xFF80CBC4), // Teal 200
    onPrimary = Color(0xFF004D40), // Teal 900
    primaryContainer = Color(0xFF00695C), // Teal 800
    onPrimaryContainer = Color(0xFFB2DFDB), // Teal 100
    secondary = Color(0xFF80CBC4), // Teal 200
    onSecondary = Color(0xFF004D40), // Teal 900
    secondaryContainer = Color(0xFF004D40), // Teal 900
    onSecondaryContainer = Color(0xFFB2DFDB), // Teal 100
)

@Composable
fun JustTranscribeTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> DarkTealScheme
        else -> LightTealScheme
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

@Composable
fun AppRoot(container: AppContainer, onStart: () -> Unit, onStop: () -> Unit) {
    val state by container.state.collectAsStateWithLifecycle()
    val config by container.config.collectAsStateWithLifecycle()
    val hasHistory by container.hasHistory.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var showSettings by remember { mutableStateOf(false) }
    var showDebug by remember { mutableStateOf(false) }

    if (showDebug) {
        DebugSessionsScreen(onClose = { showDebug = false })
    } else if (showSettings) {
        SettingsScreen(
            container = container,
            config = config,
            onClose = { showSettings = false },
            onOpenDebug = { showDebug = true },
        )
    } else {
        HomeScreen(
            state = state,
            configured = config.isAsrConfigured,
            missingFields = config.missingAsrFields(),
            hasHistory = hasHistory,
            onToggle = {
                if (state.isRunning) {
                    onStop()
                } else {
                    // Recording onto an empty screen starts a new conversation:
                    // discard any stale history so resume can't mix conversations.
                    if (state.segments.isEmpty()) container.clearTranscript()
                    onStart()
                }
            },
            onResume = {
                scope.launch {
                    container.restoreHistory()
                    onStart()
                }
            },
            onClear = { container.clearTranscript() },
            onOpenSettings = { showSettings = true },
        )
    }
}

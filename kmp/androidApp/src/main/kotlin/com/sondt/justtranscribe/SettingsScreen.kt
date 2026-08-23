@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.sondt.justtranscribe

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * Save-time verification result. A section is *invalid* when its server's
 * /v1/models answered but does not list the configured model; *unknown* when the
 * probe failed or returned no usable list. Valid sections appear in neither.
 */
private data class VerifyOutcome(val invalid: List<String>, val unknown: List<String>) {
    val allValid: Boolean get() = invalid.isEmpty() && unknown.isEmpty()
}

private enum class ModelCheck { Valid, Invalid, Unknown }

private fun checkModel(r: AsrClient.ConnTest, model: String): ModelCheck = when (r) {
    is AsrClient.ConnTest.Ok -> when {
        r.models.isEmpty() -> ModelCheck.Unknown
        model in r.models -> ModelCheck.Valid
        else -> ModelCheck.Invalid
    }
    is AsrClient.ConnTest.Err -> ModelCheck.Unknown
}

@Composable
fun SettingsScreen(
    container: AppContainer,
    config: AppConfig,
    onClose: () -> Unit,
    onOpenDebug: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var draft by remember(config) { mutableStateOf(config) }
    var testResult by remember { mutableStateOf<String?>(null) }
    var models by remember { mutableStateOf<List<String>>(emptyList()) }
    var llmTestResult by remember { mutableStateOf<String?>(null) }
    var llmModels by remember { mutableStateOf<List<String>>(emptyList()) }

    var saving by remember { mutableStateOf(false) }
    var exitDialog by remember { mutableStateOf(false) }
    var verifyOutcome by remember { mutableStateOf<VerifyOutcome?>(null) }
    // Whether the in-flight save should also close the screen when it lands.
    var closeAfterSave by remember { mutableStateOf(false) }

    val dirty = draft != config

    /** Probe both servers and classify each configured section. */
    suspend fun verify(c: AppConfig): VerifyOutcome = coroutineScope {
        val asr = async { container.testConnection(c.asrBaseUrl, c.asrApiKey) }
        val llm = if (c.llmApiBase.isNotEmpty()) async { container.testConnection(c.llmApiBase, c.llmApiKey) } else null
        val invalid = mutableListOf<String>()
        val unknown = mutableListOf<String>()
        fun sort(section: String, r: AsrClient.ConnTest, model: String) {
            when (checkModel(r, model)) {
                ModelCheck.Valid -> Unit
                ModelCheck.Invalid -> invalid += section
                ModelCheck.Unknown -> unknown += section
            }
        }
        sort("ASR", asr.await(), c.asrModel)
        llm?.let { sort("Translation LLM", it.await(), c.llmModel) }
        VerifyOutcome(invalid, unknown)
    }

    fun persist(close: Boolean) = scope.launch {
        container.saveConfig(draft)
        if (close) onClose()
    }

    fun saveWithVerification(close: Boolean) {
        if (saving) return
        closeAfterSave = close
        scope.launch {
            saving = true
            val outcome = verify(draft)
            saving = false
            if (outcome.allValid) persist(close) else verifyOutcome = outcome
        }
    }

    fun requestExit() {
        if (dirty) exitDialog = true else onClose()
    }

    BackHandler { requestExit() }

    Scaffold(
        modifier = Modifier.imePadding(),
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = { requestExit() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            // Pinned above the keyboard so Save is always reachable while editing.
            Surface(tonalElevation = 3.dp) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Button(
                        onClick = { saveWithVerification(close = false) },
                        enabled = draft.isAsrConfigured && !saving,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (saving) "Verifying…" else "Save") }
                    if (!draft.isAsrConfigured) {
                        Text(
                            "To save, fill in: ${draft.missingAsrFields().joinToString(", ")}",
                            Modifier.padding(top = 4.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            SectionTitle("ASR server")
            Field("Base URL", draft.asrBaseUrl) { draft = draft.copy(asrBaseUrl = it) }
            Field("API key (optional)", draft.asrApiKey) { draft = draft.copy(asrApiKey = it) }
            if (models.isNotEmpty()) {
                ModelDropdown(models, draft.asrModel) { draft = draft.copy(asrModel = it) }
            } else {
                Field("Model", draft.asrModel) { draft = draft.copy(asrModel = it) }
            }
            Button(
                onClick = {
                    scope.launch {
                        testResult = "Testing…"
                        when (val r = container.testConnection(draft.asrBaseUrl, draft.asrApiKey)) {
                            is AsrClient.ConnTest.Ok -> {
                                models = r.models
                                // A server with a single model is unambiguous — select it.
                                if (r.models.size == 1) draft = draft.copy(asrModel = r.models.single())
                                testResult = "OK — ${r.models.size} model(s)"
                            }
                            is AsrClient.ConnTest.Err -> testResult = "Error: ${r.message}"
                        }
                    }
                },
            ) { Text("Test connection") }
            testResult?.let { Text(it, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall) }

            SectionTitle("Translation (LLM) server")
            Field("Base URL", draft.llmApiBase) { draft = draft.copy(llmApiBase = it) }
            Field("API key (optional)", draft.llmApiKey) { draft = draft.copy(llmApiKey = it) }
            if (llmModels.isNotEmpty()) {
                ModelDropdown(llmModels, draft.llmModel) { draft = draft.copy(llmModel = it) }
            } else {
                Field("Model", draft.llmModel) { draft = draft.copy(llmModel = it) }
            }
            Button(
                onClick = {
                    scope.launch {
                        llmTestResult = "Testing…"
                        // The LLM endpoint is OpenAI-compatible, so the same /v1/models probe applies.
                        when (val r = container.testConnection(draft.llmApiBase, draft.llmApiKey)) {
                            is AsrClient.ConnTest.Ok -> {
                                llmModels = r.models
                                if (r.models.size == 1) draft = draft.copy(llmModel = r.models.single())
                                llmTestResult = "OK — ${r.models.size} model(s)"
                            }
                            is AsrClient.ConnTest.Err -> llmTestResult = "Error: ${r.message}"
                        }
                    }
                },
            ) { Text("Test connection") }
            llmTestResult?.let { Text(it, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall) }

            SectionTitle("Languages")
            Field("Primary target (e.g. en)", draft.preferredLanguage) { draft = draft.copy(preferredLanguage = it) }
            Field("Secondary target (optional, e.g. vi)", draft.preferredLanguage2) { draft = draft.copy(preferredLanguage2 = it) }
            Field("ASR language hint (blank = auto-detect)", draft.asrLanguage) { draft = draft.copy(asrLanguage = it) }

            SectionTitle("Debugging")
            Row(
                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Save debug audio", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Keep a WAV of each transcribed segment in the session trace",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = draft.debugAudio, onCheckedChange = { draft = draft.copy(debugAudio = it) })
            }
            OutlinedButton(onClick = onOpenDebug, modifier = Modifier.fillMaxWidth()) {
                Text("Debug sessions")
            }
            Spacer(Modifier.height(16.dp))
        }
    }

    if (exitDialog) {
        AlertDialog(
            onDismissRequest = { exitDialog = false },
            title = { Text("Unsaved changes") },
            text = { Text("Save your changes before leaving?") },
            confirmButton = {
                TextButton(onClick = { exitDialog = false; saveWithVerification(close = true) }) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { exitDialog = false; onClose() }) { Text("Discard") }
            },
        )
    }

    verifyOutcome?.let { outcome ->
        val invalid = outcome.invalid.isNotEmpty()
        AlertDialog(
            onDismissRequest = { verifyOutcome = null },
            title = { Text(if (invalid) "Model not found on server" else "Could not verify models") },
            text = {
                Text(
                    buildString {
                        if (invalid) {
                            append("${outcome.invalid.joinToString(" and ")}: the configured model is not in the server's model list.")
                            if (outcome.unknown.isNotEmpty()) {
                                append("\n${outcome.unknown.joinToString(" and ")}: server unreachable, could not verify.")
                            }
                            append("\n\nSave anyway?")
                        } else {
                            append("${outcome.unknown.joinToString(" and ")}: server unreachable, the model name could not be verified. Save unverified?")
                        }
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { verifyOutcome = null; persist(closeAfterSave) }) {
                    Text(if (invalid) "Save anyway" else "Save unverified")
                }
            },
            dismissButton = {
                TextButton(onClick = { verifyOutcome = null }) { Text(if (invalid) "Fix" else "Cancel") }
            },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        Modifier.padding(top = 16.dp, bottom = 8.dp),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
    )
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    )
}

@Composable
private fun ModelDropdown(models: List<String>, selected: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        OutlinedTextField(
            value = selected,
            onValueChange = {},
            readOnly = true,
            label = { Text("Model") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            models.forEach { m ->
                DropdownMenuItem(
                    text = { Text(m) },
                    onClick = { onSelect(m); expanded = false },
                )
            }
        }
    }
}

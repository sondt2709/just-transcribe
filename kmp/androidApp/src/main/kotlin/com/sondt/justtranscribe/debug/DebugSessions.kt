package com.sondt.justtranscribe.debug

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private val Context.debugDataStore: DataStore<Preferences> by preferencesDataStore(name = "debug_state")

/**
 * Session storage layout + automatic daily retention. Sessions live in app-internal
 * storage (`filesDir/sessions/<yyyy-MM-dd_HH-mm-ss>/`) — no permissions, wiped on
 * uninstall. Retention is "today only": [ensureDailyCleanup] runs from the first
 * storage access of each calendar day (session start or debug screen open) and
 * deletes every session directory from previous days; the last-cleanup date is
 * persisted in Preferences DataStore so it runs at most once per day.
 */
object DebugSessions {
    private val lastCleanupDate = stringPreferencesKey("last_cleanup_date")
    private val nameFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss")
    private val dayFormat = DateTimeFormatter.ISO_LOCAL_DATE

    fun sessionsDir(context: Context): File = File(context.filesDir, "sessions")

    fun newSessionName(): String = LocalDateTime.now().format(nameFormat)

    suspend fun ensureDailyCleanup(context: Context) {
        val today = LocalDate.now().format(dayFormat)
        val last = context.debugDataStore.data.first()[lastCleanupDate]
        if (last == today) return
        sessionsDir(context).listFiles()?.forEach { dir ->
            if (dir.isDirectory && !dir.name.startsWith(today)) dir.deleteRecursively()
        }
        context.debugDataStore.edit { it[lastCleanupDate] = today }
    }
}

package com.sondt.justtranscribe

import android.app.backup.BackupAgentHelper
import android.app.backup.FileBackupHelper

/**
 * Key-value backup for the settings DataStore file. Combined with
 * `BackupManager.dataChanged()` after every save (see [AppContainer.saveConfig]),
 * this keeps the cloud copy fresh so a reinstall restores the last-saved
 * configuration — Auto Backup alone uploads on a ~daily schedule and routinely
 * restored stale settings.
 */
class SettingsBackupAgent : BackupAgentHelper() {
    override fun onCreate() {
        // Path is relative to getFilesDir(); preferencesDataStore(name = "settings")
        // writes files/datastore/settings.preferences_pb.
        addHelper("settings", FileBackupHelper(this, "datastore/settings.preferences_pb"))
    }
}

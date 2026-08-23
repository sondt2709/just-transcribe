package com.sondt.justtranscribe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Foreground service (type `microphone`) that owns the recording session so capture
 * continues with the screen off. It drives [AppContainer.requestStart]/[requestStop];
 * the pipeline itself lives in the process-wide container scope.
 *
 * The service exists only while the pipeline is actually recording: it is
 * `START_NOT_STICKY` (a mic capture session must never auto-resume after a crash),
 * and it watches the pipeline state so an in-session failure or a rejected start
 * removes the notification instead of leaving "Listening…" over a dead pipeline.
 */
class TranscribeService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var watchJob: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when {
            intent?.action == ACTION_STOP -> {
                container.requestStop()
                shutdown()
            }
            // System revival (null intent): never auto-resume recording.
            intent == null -> shutdown()
            else -> {
                ensureChannel()
                startInForeground()
                container.requestStart()
                watchPipeline()
            }
        }
        return START_NOT_STICKY
    }

    /**
     * Stop the service whenever the pipeline is not recording: the first emission
     * already reflects a rejected start (still Idle), and any later transition to
     * Idle means the session ended — by error or by a stop that bypassed ACTION_STOP.
     */
    private fun watchPipeline() {
        watchJob?.cancel()
        watchJob = serviceScope.launch {
            container.state.collect { s ->
                when (s.status) {
                    PipelineStatus.Starting, PipelineStatus.Recording, PipelineStatus.Stopping -> Unit
                    PipelineStatus.Idle -> shutdown()
                }
            }
        }
    }

    private fun shutdown() {
        watchJob?.cancel()
        watchJob = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun startInForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                mgr.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "Transcription", NotificationManager.IMPORTANCE_LOW),
                )
            }
        }
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, TranscribeService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Just Transcribe")
            .setContentText("Listening…")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "transcribe"
        private const val NOTIF_ID = 1
        const val ACTION_STOP = "com.sondt.justtranscribe.STOP"

        fun start(context: Context) {
            val i = Intent(context, TranscribeService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i)
            } else {
                context.startService(i)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, TranscribeService::class.java).setAction(ACTION_STOP),
            )
        }
    }
}

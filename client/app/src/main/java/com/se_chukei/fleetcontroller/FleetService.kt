package com.se_chukei.fleetcontroller

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class FleetService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var poller: DataBridgePoller

    // Cache the last known working standby URL dynamically
    private var lastKnownStandbyUrl: String = "rtmp://10.200.4.1/live/ambient_multicam"

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceWithNotification()

        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).run {
            newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FleetController::CpuWakeLock").apply {
                acquire(14400000L) // 4 hours safety timeout
            }
        }
        Log.d("FleetService", "Service created and WakeLock acquired.")

        // Initialize poller with backoff & network failure fallback hook
        poller = DataBridgePoller(
            dataBridgeUrl = "http://100.74.35.53:8080/api/state",
            onStateChanged = { newState, streamUrl, revoked ->
                if (revoked) {
                    Log.w("FleetService", "Access key revoked by dashboard! Enforcing fallback standby.")
                    dispatchCommand("STANDBY", lastKnownStandbyUrl)
                    return@DataBridgePoller
                }

                // Cache valid standby URLs as they stream in successfully
                if (newState.uppercase() == "STANDBY" && streamUrl.isNotBlank()) {
                    lastKnownStandbyUrl = streamUrl
                }

                dispatchCommand(newState, streamUrl)
            },
            onNetworkFailure = {
                Log.w("FleetService", "Persistent network failure detected. Falling back to last known standby: $lastKnownStandbyUrl")
                dispatchCommand("STANDBY", lastKnownStandbyUrl)
            }
        )
        poller.startPolling()
    }

    private fun dispatchCommand(state: String, url: String) {
        val intent = Intent(this, FleetService::class.java).apply {
            putExtra("STATE", state)
            putExtra("STREAM_URL", url)
        }
        onStartCommand(intent, 0, 0)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val newStateName = intent?.getStringExtra("STATE") ?: "STANDBY"
        val newStreamUrl = intent?.getStringExtra("STREAM_URL") ?: lastKnownStandbyUrl
        Log.d("FleetService", "Executing command: State=$newStateName, URL=$newStreamUrl")
        return START_STICKY
    }

    private fun startForegroundServiceWithNotification() {
        val channelId = "fleet_playback_channel"
        val channel = NotificationChannel(
            channelId,
            "Fleet Controller Video Stream",
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Active background player running")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()

        startForeground(1001, notification)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        poller.stopPolling()
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        Log.d("FleetService", "Service destroyed, poller stopped, and WakeLock released.")
        super.onDestroy()
    }
}
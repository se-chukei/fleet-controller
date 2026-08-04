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

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceWithNotification()

        // Acquire CPU WakeLock with a 4-hour timeout to prevent Android TV ambient sleep mode
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).run {
            newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FleetController::CpuWakeLock").apply {
                acquire(14400000L) // 4 hours safety timeout
            }
        }
        Log.d("FleetService", "Service created and WakeLock acquired.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val newStateName = intent?.getStringExtra("STATE") ?: "STANDBY"
        val newStreamUrl = intent?.getStringExtra("STREAM_URL") ?: ""
        Log.d("FleetService", "Received command: State=$newStateName, URL=$newStreamUrl")
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
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        Log.d("FleetService", "Service destroyed and WakeLock released.")
        super.onDestroy()
    }
}

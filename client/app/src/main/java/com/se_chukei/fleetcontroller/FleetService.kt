package com.se_chukei.fleetcontroller

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer

class FleetService : Service() {

    private companion object {
        const val TAG = "FleetService"
        const val STREAM_TIMEOUT_MS = 10000L // 10s watchdog timeout for stalled streams
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "fleet_controller_media"
    }

    private var exoPlayer: ExoPlayer? = null
    private var vlcPlayer: MediaPlayer? = null
    private var libVLC: LibVLC? = null

    private val watchdogHandler = Handler(Looper.getMainLooper())
    private var streamWatchdogRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "FleetService created")
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("STANDBY"))
        suppressBluetoothDiscovery()
        initializePlayers()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val state = intent?.getStringExtra("STATE") ?: "STANDBY"
        val url = intent?.getStringExtra("STREAM_URL") ?: intent?.getStringExtra("URL") ?: ""

        updateNotification(state)

        if (url.isNotBlank()) {
            executeCommand(state, url)
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Fleet Controller Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Fleet Controller media playback status"
                setSound(null, null)
                enableVibration(false)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(state: String): Notification {
        val label = state.uppercase()
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Fleet Controller")
            .setContentText("State: $label")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(state: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(state))
    }

    private fun suppressBluetoothDiscovery() {
        val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter() ?: return
        try {
            // Allows already-paired devices (like Bluetooth remotes) to stay connected,
            // but stops the TV from broadcasting discovery/pairing requests to nearby devices.
            val method = bluetoothAdapter.javaClass.getMethod("setScanMode", Int::class.java)
            method.invoke(bluetoothAdapter, BluetoothAdapter.SCAN_MODE_CONNECTABLE)
            Log.d(TAG, "Bluetooth scan mode set to CONNECTABLE (discovery hidden)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set Bluetooth scan mode", e)
        }
    }

    private fun initializePlayers() {
        // Initialize ExoPlayer & Listener
        exoPlayer = ExoPlayer.Builder(this).build().apply {
            addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    cancelWatchdog()
                    Log.d(TAG, "ExoPlayer stream determined to be problematic")
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (isPlaying) {
                        cancelWatchdog()
                    }
                }
            })
        }

        // Initialize LibVLC & Listener
        try {
            libVLC = LibVLC(this, ArrayList<String>().apply {
                add("--no-drop-late-frames")
                add("--no-skip-frames")
                add("--rtsp-tcp")
            })
            vlcPlayer = MediaPlayer(libVLC).apply {
                setEventListener { event ->
                    when (event.type) {
                        MediaPlayer.Event.EncounteredError -> {
                            cancelWatchdog()
                            Log.d(TAG, "VLC stream determined to be problematic")
                        }
                        MediaPlayer.Event.Playing -> {
                            cancelWatchdog()
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize LibVLC", e)
        }
    }

    private fun executeCommand(state: String, url: String) {
        Log.d(TAG, "Executing command: State=$state, URL=$url")
        cancelWatchdog()

        when (state) {
            "STANDBY" -> {
                stopPlayback()
                Log.d(TAG, "Saved new good STANDBY URL: $url")
                Log.d(TAG, "State applied → STANDBY | url=$url")
            }
            "STREAM" -> {
                Log.d(TAG, "State applied → STREAM | url=$url")
                startPlayback(url)
            }
        }
    }

    private fun startPlayback(url: String) {
        stopPlayback()
        scheduleWatchdog()

        val isRtmp = url.startsWith("rtmp://", ignoreCase = true)

        if (isRtmp) {
            vlcPlayer?.let { player ->
                libVLC?.let { vlc ->
                    val media = Media(vlc, android.net.Uri.parse(url))
                    player.media = media
                    media.release()
                    player.play()
                }
            }
        } else {
            exoPlayer?.let { player ->
                val mediaItem = MediaItem.fromUri(url)
                player.setMediaItem(mediaItem)
                player.prepare()
                player.play()
            }
        }
    }

    private fun stopPlayback() {
        cancelWatchdog()
        exoPlayer?.stop()
        vlcPlayer?.stop()
    }

    private fun scheduleWatchdog() {
        cancelWatchdog()
        streamWatchdogRunnable = Runnable {
            Log.d(TAG, "Stream determined to be severely problematic")
        }
        watchdogHandler.postDelayed(streamWatchdogRunnable!!, STREAM_TIMEOUT_MS)
    }

    private fun cancelWatchdog() {
        streamWatchdogRunnable?.let { watchdogHandler.removeCallbacks(it) }
        streamWatchdogRunnable = null
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopPlayback()
        exoPlayer?.release()
        exoPlayer = null
        vlcPlayer?.release()
        vlcPlayer = null
        libVLC?.release()
        libVLC = null
        Log.d(TAG, "Service destroyed, poller stopped, and WakeLock released.")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
package com.se_chukei.fleetcontroller

import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
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
    }

    private var exoPlayer: ExoPlayer? = null
    private var vlcPlayer: MediaPlayer? = null
    private var libVLC: LibVLC? = null

    private val watchdogHandler = Handler(Looper.getMainLooper())
    private var streamWatchdogRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "FleetService created")
        suppressBluetoothDiscovery()
        initializePlayers()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val state = intent?.getStringExtra("STATE")
        val url = intent?.getStringExtra("URL")

        if (state != null && url != null) {
            executeCommand(state, url)
        }

        return START_STICKY
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

        // Attempt ExoPlayer playback
        exoPlayer?.let { player ->
            val mediaItem = MediaItem.fromUri(url)
            player.setMediaItem(mediaItem)
            player.prepare()
            player.play()
        }

        // Attempt VLC playback fallback
        vlcPlayer?.let { player ->
            libVLC?.let { vlc ->
                val media = Media(vlc, android.net.Uri.parse(url))
                player.media = media
                media.release()
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
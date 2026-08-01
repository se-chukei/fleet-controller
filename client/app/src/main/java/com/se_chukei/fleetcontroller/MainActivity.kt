package com.se_chukei.fleetcontroller

import android.os.Bundle
import android.os.PowerManager
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.core.net.toUri
import com.se_chukei.fleetcontroller.State.*
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout
import java.io.IOException
import kotlin.random.Random
import kotlin.time.Duration.Companion.milliseconds

// Define the operational states
enum class State {
    STANDBY, STREAM, PLAYBACK
}

class MainActivity : AppCompatActivity() {

    private lateinit var libVLC: LibVLC
    private lateinit var mediaPlayer: MediaPlayer
    private lateinit var vlcVideoLayout: VLCVideoLayout

    private var wakeLock: PowerManager.WakeLock? = null

    private val client = OkHttpClient()
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    // The Data Bridge endpoint on your Mac's Tailscale IP
    private val dataBridgeUrl = "http://10.74.35.53:8080/api/state"
    private var currentStreamUrl: String? = null
    private var currentState: State = STANDBY
    private var fleetServiceIntent: Intent? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        vlcVideoLayout = findViewById(R.id.vlc_video_layout)

        // Initialize LibVLC
        val args = ArrayList<String>().apply {
            add("-vvv") // Verbose logs
            add("--live-caching=1500") // 1.5 seconds network buffer
            add("--clock-jitter=0")
            add("--clock-synchro=0")
        }
        libVLC = LibVLC(this, args)
        mediaPlayer = MediaPlayer(libVLC)
        mediaPlayer.attachViews(vlcVideoLayout, null, true, false)

        // Start the FleetService
        fleetServiceIntent = Intent(this, FleetService::class.java)
        startService(fleetServiceIntent)

        startPollingDataBridge()
    }

    private fun startPollingDataBridge() {
        scope.launch {
            while (isActive) {
                try {
                    val request = Request.Builder().url(dataBridgeUrl).build()
                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            val responseBody = response.body?.string()
                            if (responseBody != null) {
                                val json = JSONObject(responseBody)
                                val newStreamUrl = json.optString("streamUrl", "")
                                val appStateString = json.optString("appState", "STANDBY")
                                val accessKeyRevoked = json.optBoolean("accessKeyRevoked", false)

                                val newState = when (appStateString) {
                                    "STREAM" -> STREAM
                                    "PLAYBACK" -> PLAYBACK
                                    else -> STANDBY
                                }

                                // Update state and URL if they have changed
                                if (newState != currentState || newStreamUrl != currentStreamUrl) {
                                    currentState = newState
                                    currentStreamUrl = newStreamUrl

                                    // If access key is revoked, go to STANDBY and stop playback
                                    if (accessKeyRevoked) {
                                        Log.w("MainActivity", "Access key revoked. Entering STANDBY state.")
                                        updateState(STANDBY, null)
                                    } else {
                                        updateState(currentState, currentStreamUrl)
                                    }
                                }
                            }
                        } else {
                            Log.e("MainActivity", "Failed to poll Data Bridge: ${response.code}")
                            // If Data Bridge is unreachable, default to STANDBY
                            if (currentState != STANDBY) {
                                updateState(STANDBY, null)
                            }
                        }
                    }
                } catch (e: IOException) {
                    Log.e("MainActivity", "IOException polling Data Bridge: ${e.message}")
                    // Data bridge might be offline, will silently retry
                    if (currentState != STANDBY) {
                        updateState(STANDBY, null)
                    }
                }

                // 2 seconds + 1-3 seconds jitter
                val jitter = Random.nextLong(1000, 3000)
                delay((2000 + jitter).milliseconds)
            }
        }
    }

    private fun updateState(newState: State, url: String?) {
        Log.d("MainActivity", "Updating state to: $newState, URL: $url")
        currentState = newState
        currentStreamUrl = url

        when (currentState) {
            STANDBY -> {
                mediaPlayer.stop()
                // Optionally, display a standby screen or graphic
                // For now, just stop playback
                vlcVideoLayout.visibility = android.view.View.GONE // Hide video view in standby
            }
            STREAM -> {
                if (url != null) {
                    playStream(url)
                    vlcVideoLayout.visibility = android.view.View.VISIBLE // Show video view
                } else {
                    Log.e("MainActivity", "STREAM state requires a URL.")
                    // Fallback to STANDBY if URL is missing
                    updateState(STANDBY, null)
                }
            }
            PLAYBACK -> {
                if (url != null) {
                    playStream(url)
                    vlcVideoLayout.visibility = android.view.View.VISIBLE // Show video view
                } else {
                    Log.e("MainActivity", "PLAYBACK state requires a URL.")
                    // Fallback to STANDBY if URL is missing
                    updateState(STANDBY, null)
                }
            }
        }

        // Send state update to FleetService
        fleetServiceIntent?.let {
            it.putExtra("STATE", currentState.name)
            it.putExtra("STREAM_URL", url)
            startService(it)
        }
    }

    private fun playStream(url: String) {
        Log.d("MainActivity", "Playing stream: $url")
        val media = Media(libVLC, url.toUri())
        mediaPlayer.media = media
        media.release()
        mediaPlayer.play()
    }

    override fun onResume() {
        super.onResume()
        // Acquire wake lock to prevent TV from sleeping
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FleetController::CpuWakeLock").apply {
            acquire(14400000L) // 4 hours timeout
        }
    }

    override fun onPause() {
        super.onPause()
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        mediaPlayer.release()
        libVLC.release()
        // Stop the FleetService when MainActivity is destroyed
        fleetServiceIntent?.let { stopService(it) }
    }
}



package com.se_chukei.fleetcontroller

import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.core.net.toUri
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
    private lateinit var featureRegistry: FeatureRegistry

    private var wakeLock: PowerManager.WakeLock? = null

    private val client = OkHttpClient()
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    // Configurable Data Bridge URL with fallback to local development server
    private val dataBridgeUrl = System.getProperty("fleet.databridge.url") ?: "http://100.74.35.53:3000/api/state"
    private var currentStreamUrl: String? = null
    private var currentState: State = State.STANDBY
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

        // Initialize State Engine & Feature Module Registry
        featureRegistry = FeatureRegistry(this)

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
                                    "STREAM" -> State.STREAM
                                    "PLAYBACK" -> State.PLAYBACK
                                    else -> State.STANDBY
                                }

                                // Update state and URL if they have changed
                                if (newState != currentState || newStreamUrl != currentStreamUrl) {
                                    // If access key is revoked, go to STANDBY and stop playback
                                    if (accessKeyRevoked) {
                                        Log.w("MainActivity", "Access key revoked. Entering STANDBY state.")
                                        updateState(State.STANDBY, null)
                                    } else {
                                        updateState(newState, newStreamUrl)
                                    }
                                }
                            }
                        } else {
                            Log.e("MainActivity", "Failed to poll Data Bridge: ${response.code}")
                            // If Data Bridge is unreachable, default to STANDBY
                            if (currentState != State.STANDBY) {
                                updateState(State.STANDBY, null)
                            }
                        }
                    }
                } catch (e: IOException) {
                    Log.e("MainActivity", "IOException polling Data Bridge: ${e.message}")
                    // Data bridge might be offline, will silently retry
                    if (currentState != State.STANDBY) {
                        updateState(State.STANDBY, null)
                    }
                }

                // 2 seconds + 1-3 seconds jitter
                val jitter = Random.nextLong(1000, 3000)
                delay((2000 + jitter).milliseconds)
            }
        }
    }

    private fun updateState(newState: State, url: String?) {
        // Run state transitions and UI operations on the main thread
        runOnUiThread {
            Log.d("MainActivity", "Updating state to: $newState, URL: $url")
            currentState = newState
            currentStreamUrl = url

            val bundle = Bundle().apply {
                putString("streamUrl", url)
            }
            featureRegistry.transitionTo(newState, bundle)

            // Send state update to FleetService
            fleetServiceIntent?.let {
                it.putExtra("STATE", currentState.name)
                it.putExtra("STREAM_URL", url)
                startService(it)
            }
        }
    }

    fun playStream(url: String) {
        Log.d("MainActivity", "Playing stream: $url")
        
        // Ensure the video layout view is visible and prioritized first
        vlcVideoLayout.visibility = android.view.View.VISIBLE
        vlcVideoLayout.bringToFront()
        vlcVideoLayout.requestLayout()

        vlcVideoLayout.post {
            try {
                mediaPlayer.stop()
                val media = Media(libVLC, url.toUri()).apply {
                    setHWDecoderEnabled(true, false)
                    addOption(":network-caching=1500")
                }
                mediaPlayer.media = media
                media.release()
                mediaPlayer.play()
            } catch (e: Exception) {
                Log.e("MainActivity", "Failed to start media playback: ${e.message}")
            }
        }
    }

    fun stopStream() {
        Log.d("MainActivity", "Stopping active stream playback")
        mediaPlayer.stop()
        vlcVideoLayout.visibility = android.view.View.GONE
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
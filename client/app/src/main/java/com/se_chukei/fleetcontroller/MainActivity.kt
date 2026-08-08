package com.se_chukei.fleetcontroller

import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import `is`.xyz.mpv.MPVLib
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.IOException
import kotlin.random.Random
import kotlin.time.Duration.Companion.milliseconds

// Define the operational states
enum class State {
    STANDBY, STREAM, PLAYBACK
}

class MainActivity : AppCompatActivity() {

    private lateinit var mpvVideoView: MPVView
    private lateinit var featureRegistry: FeatureRegistry
    private lateinit var usbMediaScraper: UsbMediaScraper

    private var wakeLock: PowerManager.WakeLock? = null

    private val client = OkHttpClient()
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    // Configurable Data Bridge URL with fallback to local development server
    private val dataBridgeUrl = System.getProperty("fleet.databridge.url") ?: "http://100.74.35.53:3000/api/state"
    private var currentStreamUrl: String? = null
    private var currentState: State = State.STANDBY
    private var fleetServiceIntent: Intent? = null

    // MPV playlist management state
    private var playlist: List<File> = emptyList()
    private var currentPlaylistIndex: Int = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Prevent the TV from going to sleep due to inactivity during streaming
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        mpvVideoView = findViewById(R.id.mpv_video_view)

        // Initialize MPVLib instance
        MPVLib.safeCreate(applicationContext, "info")
        MPVLib.safeSetOptionString("hwdec", "mediacodec") // Hardware accelerated decoding
        MPVLib.safeSetOptionString("vo", "gpu") // GPU-accelerated video rendering
        MPVLib.safeSetOptionString("cache", "yes")
        MPVLib.safeSetOptionString("demuxer-max-bytes", "150000000") // 150MB maximum demuxer memory
        MPVLib.safeInit()

        // Initialize State Engine & Feature Module Registry
        featureRegistry = FeatureRegistry(this)

        // Initialize USB Auto-Scraper
        usbMediaScraper = UsbMediaScraper(this) { updatedPlaylist ->
            runOnUiThread {
                Log.i("MainActivity", "USB playlist updated with size: ${updatedPlaylist.size}")
                playlist = updatedPlaylist
                if (currentState == State.PLAYBACK) {
                    if (playlist.isNotEmpty() && currentPlaylistIndex == -1) {
                        playPlaylistItem(0)
                    }
                }
            }
        }

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
        Log.d("MainActivity", "Playing stream via MPV: $url")
        
        // Ensure the video layout view is visible and prioritized first
        mpvVideoView.visibility = android.view.View.VISIBLE
        mpvVideoView.bringToFront()
        mpvVideoView.requestLayout()

        mpvVideoView.post {
            try {
                // Command to load stream url in MPV
                MPVLib.safeCommand(arrayOf("loadfile", url, "replace"))
            } catch (e: Exception) {
                Log.e("MainActivity", "Failed to start media playback: ${e.message}")
            }
        }
    }

    fun stopStream() {
        Log.d("MainActivity", "Stopping active stream playback")
        MPVLib.safeCommand(arrayOf("stop"))
        mpvVideoView.visibility = android.view.View.GONE
    }

    // --- Local USB Playback Controls Driven by libmpv commands ---

    fun startUsbPlayback() {
        Log.i("MainActivity", "Starting USB Playlist playback")
        mpvVideoView.visibility = android.view.View.VISIBLE
        mpvVideoView.bringToFront()
        mpvVideoView.requestLayout()

        // Scan/rescrape USB files
        usbMediaScraper.startScraping()

        if (playlist.isNotEmpty()) {
            playPlaylistItem(0)
        } else {
            Log.w("MainActivity", "USB playlist is empty. Waiting for insertions.")
        }
    }

    fun stopUsbPlayback() {
        Log.i("MainActivity", "Stopping USB Playlist playback")
        MPVLib.safeCommand(arrayOf("stop"))
        mpvVideoView.visibility = android.view.View.GONE
        currentPlaylistIndex = -1
    }

    fun playPlaylistItem(index: Int) {
        if (playlist.isEmpty()) return
        val validatedIndex = index.coerceIn(0, playlist.size - 1)
        currentPlaylistIndex = validatedIndex
        val targetFile = playlist[validatedIndex]
        Log.i("MainActivity", "Playing USB Playlist Item [$validatedIndex]: ${targetFile.absolutePath}")
        MPVLib.safeCommand(arrayOf("loadfile", targetFile.absolutePath, "replace"))
    }

    fun pausePlayback() {
        Log.i("MainActivity", "Pausing mpv playback")
        MPVLib.safeSetPropertyString("pause", "yes")
    }

    fun resumePlayback() {
        Log.i("MainActivity", "Resuming mpv playback")
        MPVLib.safeSetPropertyString("pause", "no")
    }

    fun nextPlaylistItem() {
        if (playlist.isEmpty()) return
        Log.i("MainActivity", "Navigating to next playlist item")
        val nextIndex = (currentPlaylistIndex + 1) % playlist.size
        playPlaylistItem(nextIndex)
    }

    fun previousPlaylistItem() {
        if (playlist.isEmpty()) return
        Log.i("MainActivity", "Navigating to previous playlist item")
        var prevIndex = currentPlaylistIndex - 1
        if (prevIndex < 0) {
            prevIndex = playlist.size - 1
        }
        playPlaylistItem(prevIndex)
    }

    fun selectTrack(trackId: Int) {
        Log.i("MainActivity", "Selecting track: $trackId")
        MPVLib.safeSetPropertyString("sid", trackId.toString()) // subtitle track selection
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
        usbMediaScraper.stopScraping()
        MPVLib.safeDestroy()
        // Stop the FleetService when MainActivity is destroyed
        fleetServiceIntent?.let { stopService(it) }
    }
}

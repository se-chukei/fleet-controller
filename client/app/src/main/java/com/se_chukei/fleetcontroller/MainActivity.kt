package com.se_chukei.fleetcontroller

import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.net.toUri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Duration.Companion.milliseconds

enum class State {
    STANDBY, STREAM, PLAYBACK
}

class MainActivity : AppCompatActivity() {

    private lateinit var libVLC: LibVLC
    private lateinit var mediaPlayer: MediaPlayer
    private lateinit var vlcVideoLayout: VLCVideoLayout

    private var wakeLock: PowerManager.WakeLock? = null
    private var targetVolume = 100
    private var blackOverlay: View? = null

    /** Single-flight gate for play/stop/recreate (replaces fragile boolean-only logic). */
    private val playerMutex = Mutex()
    private val isTransitioning = AtomicBoolean(false)

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(5, 5, TimeUnit.MINUTES))
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val dataBridgeUrl = System.getProperty("fleet.databridge.url")
        ?: "http://100.74.35.53:3000/api/state"

    private val freezeLog = ArrayDeque<String>(80)
    private val maxFreezeLogEntries = 80

    private var currentStreamUrl: String? = null
    private var currentState: State = State.STANDBY
    private var fleetServiceIntent: Intent? = null

    private var lastValidStandbyUrl: String? = null
    private var lastValidStreamUrl: String? = null

    private var lastCheckedPosition: Long = -1L
    private var consecutiveStalls = 0
    private var consecutivePlaybackErrors = 0
    private var consecutiveNetworkFailures = 0
    private var watchdogJob: Job? = null
    private var keepaliveJob: Job? = null

    /** After soft reload, require progress before this elapsed or escalate to hard reset. */
    private var softRecoveryDeadlineMs: Long = 0L
    private var awaitingSoftRecoveryProgress = false

    /** Rate-limit hard resets. */
    private var lastHardResetMs: Long = 0L
    private val hardResetCooldownMs = 120_000L

    /** STANDBY proactive keepalive interval (50 minutes). */
    private val standbyKeepaliveIntervalMs = 50 * 60 * 1000L
    private var lastKeepaliveMs: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        vlcVideoLayout = findViewById(R.id.vlc_video_layout)

        blackOverlay = View(this).apply {
            setBackgroundColor(android.graphics.Color.BLACK)
            alpha = 0f
            visibility = View.GONE
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        (findViewById<View>(android.R.id.content) as? android.view.ViewGroup)
            ?.addView(blackOverlay)

        val args = ArrayList<String>().apply {
            add("-vvv")
            add("--http-reconnect")
            add("--avcodec-hw=any")
        }
        libVLC = LibVLC(this, args)

        mediaPlayer = MediaPlayer(libVLC)
        mediaPlayer.attachViews(vlcVideoLayout, null, true, false)
        attachPlayerEventListener()

        fleetServiceIntent = Intent(this, FleetService::class.java)
        startService(fleetServiceIntent)

        startPollingDataBridge()
        startIndependentWatchdog()
        startStandbyKeepalive()
    }

    private fun forceStopImmediate() {
        try {
            mediaPlayer.stop()
            mediaPlayer.media?.release()
            mediaPlayer.media = null
        } catch (e: Exception) {
            Log.w("MainActivity", "forceStopImmediate error: ${e.message}")
        }
        vlcVideoLayout.visibility = View.GONE
        lastCheckedPosition = -1L
        setPlayerVolume(0)
    }

    private fun fadeVolumeOut(from: Int, to: Int, durationMs: Long) {
        val steps = 12
        val stepTime = durationMs / steps
        val volumeStep = (from - to).toFloat() / steps
        var currentStep = 0

        val runnable = object : Runnable {
            override fun run() {
                if (currentStep > steps) return
                val vol = (from - volumeStep * currentStep).toInt().coerceIn(0, 100)
                setPlayerVolume(vol)
                currentStep++
                if (currentStep <= steps) {
                    vlcVideoLayout.postDelayed(this, stepTime)
                }
            }
        }
        vlcVideoLayout.post(runnable)
    }

    private fun fadeVolumeIn(from: Int, to: Int, durationMs: Long) {
        val steps = 12
        val stepTime = durationMs / steps
        val volumeStep = (to - from).toFloat() / steps
        var currentStep = 0

        val runnable = object : Runnable {
            override fun run() {
                if (currentStep > steps) return
                val vol = (from + volumeStep * currentStep).toInt().coerceIn(0, 100)
                setPlayerVolume(vol)
                currentStep++
                if (currentStep <= steps) {
                    vlcVideoLayout.postDelayed(this, stepTime)
                }
            }
        }
        vlcVideoLayout.post(runnable)
    }

    private fun setPlayerVolume(vol: Int) {
        try {
            mediaPlayer.volume = vol.coerceIn(0, 100)
        } catch (e: Exception) {
            Log.w("MainActivity", "setPlayerVolume failed: ${e.message}")
        }
    }

    private fun attachPlayerEventListener() {
        mediaPlayer.setEventListener { event ->
            when (event.type) {
                MediaPlayer.Event.EncounteredError,
                MediaPlayer.Event.EndReached -> {
                    consecutivePlaybackErrors++
                    logFreeze("VLC event: ${event.type}")
                    Log.w("MainActivity", "VLC error/end (count=$consecutivePlaybackErrors)")

                    if (consecutivePlaybackErrors < 4) {
                        currentStreamUrl?.let { url ->
                            runOnUiThread { playStream(url, isRecovery = true) }
                        }
                    } else {
                        Log.e("MainActivity", "Too many playback errors → hard reset")
                        consecutivePlaybackErrors = 0
                        runOnUiThread { recreateMediaPlayer() }
                    }
                }
            }
        }
    }

    private fun startPollingDataBridge() {
        scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    if (consecutiveNetworkFailures >= 2) {
                        client.connectionPool.evictAll()
                        Log.i("MainActivity", "Evicted OkHttp connections after network failures")
                    }

                    val request = Request.Builder().url(dataBridgeUrl).build()
                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            consecutiveNetworkFailures = 0
                            response.body?.string()?.let { responseBody ->
                                val json = JSONObject(responseBody)
                                val newStreamUrl = json.optString("streamUrl", "")
                                val appStateString = json.optString("appState", "STANDBY")
                                val accessKeyRevoked = json.optBoolean("accessKeyRevoked", false)

                                Log.i("MainActivity", "Bridge → state=$appStateString | url=$newStreamUrl")

                                val newState = when (appStateString) {
                                    "STREAM" -> State.STREAM
                                    "PLAYBACK" -> State.PLAYBACK
                                    else -> State.STANDBY
                                }

                                if (newState != currentState || newStreamUrl != currentStreamUrl) {
                                    if (accessKeyRevoked) {
                                        updateState(State.STANDBY, null)
                                    } else {
                                        updateState(newState, newStreamUrl)
                                    }
                                }
                            }
                        } else {
                            consecutiveNetworkFailures++
                            if (currentState != State.STANDBY) {
                                updateState(State.STANDBY, null)
                            }
                        }
                    }
                } catch (e: Exception) {
                    consecutiveNetworkFailures++
                    Log.d("MainActivity", "Polling waiting for network/bridge: ${e.message}")
                }

                delay(2000.milliseconds)
            }
        }
    }

    private fun updateState(newState: State, url: String?) {
        runOnUiThread {
            val targetUrl = if (url.isNullOrBlank()) {
                when (newState) {
                    State.STANDBY -> lastValidStandbyUrl ?: currentStreamUrl
                    State.STREAM, State.PLAYBACK -> lastValidStreamUrl ?: currentStreamUrl
                }
            } else {
                when (newState) {
                    State.STANDBY -> lastValidStandbyUrl = url
                    State.STREAM, State.PLAYBACK -> lastValidStreamUrl = url
                }
                url
            }

            val stateChanged = newState != currentState
            val urlChanged = targetUrl != currentStreamUrl

            currentState = newState
            currentStreamUrl = targetUrl
            consecutivePlaybackErrors = 0

            Log.i("MainActivity", "State applied → $newState | url=$targetUrl")

            fleetServiceIntent?.let {
                it.putExtra("STATE", currentState.name)
                it.putExtra("STREAM_URL", targetUrl)
                startService(it)
            }

            if (targetUrl.isNullOrBlank()) {
                stopStream()
            } else if (stateChanged || urlChanged) {
                playStream(targetUrl, isRecovery = false)
            }
        }
    }

    /**
     * @param isRecovery when true, may cache-bust HLS playlist and mark soft-recovery deadline.
     */
    fun playStream(url: String, isRecovery: Boolean = false) {
        if (url.isBlank()) return

        // Prevent overlapping transitions; recovery may force-clear a stuck flag.
        if (!isTransitioning.compareAndSet(false, true)) {
            if (isRecovery) {
                Log.w("MainActivity", "Forcing transition gate open for recovery")
                isTransitioning.set(true)
            } else {
                Log.d("MainActivity", "Transition already in progress, skipping")
                return
            }
        }

        Log.i("MainActivity", "playStream: $url recovery=$isRecovery")

        vlcVideoLayout.visibility = View.VISIBLE
        vlcVideoLayout.bringToFront()

        val overlay = blackOverlay
        if (overlay == null) {
            scope.launch {
                playerMutex.withLock {
                    withContext(Dispatchers.Main) {
                        startMediaInternal(url, isRecovery)
                        setPlayerVolume(targetVolume)
                        isTransitioning.set(false)
                    }
                }
            }
            return
        }

        overlay.animate().cancel()
        overlay.alpha = 1f
        overlay.visibility = View.VISIBLE
        overlay.bringToFront()
        setPlayerVolume(0)

        scope.launch {
            playerMutex.withLock {
                withContext(Dispatchers.Main) {
                    startMediaInternal(url, isRecovery)
                }
            }

            withContext(Dispatchers.Main) {
                overlay.postDelayed({
                    overlay.animate()
                        .alpha(0f)
                        .setDuration(450)
                        .withEndAction {
                            overlay.visibility = View.GONE
                            isTransitioning.set(false)
                        }
                        .start()
                    fadeVolumeIn(from = 0, to = targetVolume, durationMs = 450)
                }, 300)
            }

            if (isRecovery) {
                awaitingSoftRecoveryProgress = true
                softRecoveryDeadlineMs = System.currentTimeMillis() + 20_000L
                lastCheckedPosition = -1L
                consecutiveStalls = 0
            }
        }
    }

    private fun startMediaInternal(url: String, isRecovery: Boolean) {
        try {
            val isStandbyFeed = url.contains("standby", ignoreCase = true) ||
                    currentState == State.STANDBY

            val networkCache = if (isStandbyFeed) "20000" else "5000"
            val liveCache = if (isStandbyFeed) "20000" else "5000"

            // On recovery, cache-bust playlist fetch (same logical URL, force re-request).
            val playUrl = if (isRecovery && url.contains(".m3u8", ignoreCase = true)) {
                val sep = if (url.contains("?")) "&" else "?"
                "$url${sep}_ts=${System.currentTimeMillis()}"
            } else {
                url
            }

            val media = Media(libVLC, playUrl.toUri()).apply {
                setHWDecoderEnabled(true, false)
                addOption(":network-caching=$networkCache")
                addOption(":live-caching=$liveCache")
                addOption(":http-reconnect")
            }

            mediaPlayer.stop()
            mediaPlayer.media?.release()
            mediaPlayer.media = media
            mediaPlayer.play()

            lastCheckedPosition = -1L
            consecutivePlaybackErrors = 0

        } catch (e: Exception) {
            Log.e("MainActivity", "startMediaInternal failed", e)
            isTransitioning.set(false)
            awaitingSoftRecoveryProgress = false
        }
    }

    private fun recreateMediaPlayer() {
        val now = System.currentTimeMillis()
        if (now - lastHardResetMs < hardResetCooldownMs) {
            Log.w("MainActivity", "Hard reset skipped (cooldown)")
            return
        }
        lastHardResetMs = now

        logFreeze("Hard player reset starting")
        reportFreezeToDataBridge("Hard player reset")
        dumpFreezeLogToLogcat()
        Log.w("MainActivity", "Hard player reset starting")

        scope.launch {
            playerMutex.withLock {
                withContext(Dispatchers.Main) {
                    try {
                        blackOverlay?.animate()?.cancel()
                        isTransitioning.set(false)
                        awaitingSoftRecoveryProgress = false

                        try {
                            mediaPlayer.stop()
                            mediaPlayer.media?.release()
                            mediaPlayer.media = null
                            mediaPlayer.detachViews()
                            mediaPlayer.release()
                        } catch (e: Exception) {
                            Log.w("MainActivity", "Old player teardown: ${e.message}")
                        }

                        mediaPlayer = MediaPlayer(libVLC)
                        mediaPlayer.attachViews(vlcVideoLayout, null, true, false)
                        attachPlayerEventListener()

                        currentStreamUrl?.let { url ->
                            playStream(url, isRecovery = true)
                        }
                    } catch (e: Exception) {
                        Log.e("MainActivity", "Hard player reset failed", e)
                        isTransitioning.set(false)
                    }
                }
            }
        }
    }

    fun stopStream() {
        blackOverlay?.animate()?.cancel()

        val overlay = blackOverlay
        if (overlay == null) {
            scope.launch {
                playerMutex.withLock {
                    withContext(Dispatchers.Main) { forceStopImmediate() }
                }
            }
            return
        }

        isTransitioning.set(true)
        overlay.alpha = 0f
        overlay.visibility = View.VISIBLE
        overlay.bringToFront()

        overlay.animate()
            .alpha(1f)
            .setDuration(400)
            .withEndAction {
                scope.launch {
                    playerMutex.withLock {
                        withContext(Dispatchers.Main) {
                            forceStopImmediate()
                            isTransitioning.set(false)
                        }
                    }
                }
            }
            .start()

        fadeVolumeOut(from = targetVolume, to = 0, durationMs = 400)
    }

    private fun startIndependentWatchdog() {
        watchdogJob?.cancel()
        watchdogJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(10_000)
                try {
                    if (currentStreamUrl.isNullOrEmpty()) continue

                    // Clear stuck transition after 15s
                    if (isTransitioning.get()) {
                        // allow in-progress fades; only log
                        Log.d("MainActivity", "Watchdog: transition in progress")
                    }

                    val currentPos = withTimeoutOrNull(2000) {
                        try {
                            mediaPlayer.time
                        } catch (e: Exception) {
                            null
                        }
                    }

                    val isTimeAdvancing =
                        currentPos != null && currentPos != -1L && currentPos != lastCheckedPosition

                    if (isTimeAdvancing) {
                        consecutiveStalls = 0
                        lastCheckedPosition = currentPos!!
                        if (awaitingSoftRecoveryProgress) {
                            logFreeze("Soft recovery succeeded (time advancing)")
                            awaitingSoftRecoveryProgress = false
                        }
                    } else {
                        consecutiveStalls++
                        logFreeze("Stall detected")
                        Log.w("MainActivity", "Stall detected (count=$consecutiveStalls) pos=$currentPos")
                        reportFreezeToDataBridge("Stall detected (count=$consecutiveStalls)")
                    }

                    // Soft recovery failed to restore progress → hard reset
                    if (awaitingSoftRecoveryProgress &&
                        System.currentTimeMillis() > softRecoveryDeadlineMs
                    ) {
                        logFreeze("Soft recovery deadline exceeded → hard reset")
                        awaitingSoftRecoveryProgress = false
                        consecutiveStalls = 0
                        withContext(Dispatchers.Main) { recreateMediaPlayer() }
                        continue
                    }

                    when {
                        consecutiveStalls >= 5 -> {
                            Log.e("MainActivity", "Severe stall → hard player reset")
                            consecutiveStalls = 0
                            withContext(Dispatchers.Main) { recreateMediaPlayer() }
                        }
                        consecutiveStalls == 3 -> {
                            logFreeze("Soft reload triggered")
                            Log.w("MainActivity", "Stall → soft reload")
                            withContext(Dispatchers.Main) {
                                currentStreamUrl?.let { playStream(it, isRecovery = true) }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Watchdog error", e)
                }
            }
        }
    }

    /** Proactive STANDBY restart to clear long-running HLS demux stalls. */
    private fun startStandbyKeepalive() {
        keepaliveJob?.cancel()
        lastKeepaliveMs = System.currentTimeMillis()
        keepaliveJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(60_000) // check every minute
                try {
                    if (currentState != State.STANDBY) continue
                    if (currentStreamUrl.isNullOrEmpty()) continue
                    if (isTransitioning.get()) continue

                    val elapsed = System.currentTimeMillis() - lastKeepaliveMs
                    if (elapsed >= standbyKeepaliveIntervalMs) {
                        logFreeze("STANDBY keepalive restart")
                        Log.i("MainActivity", "STANDBY keepalive → controlled restart")
                        lastKeepaliveMs = System.currentTimeMillis()
                        withContext(Dispatchers.Main) {
                            currentStreamUrl?.let { playStream(it, isRecovery = true) }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Keepalive error", e)
                }
            }
        }
    }

    private fun logFreeze(message: String) {
        val time = try {
            mediaPlayer.time
        } catch (e: Exception) {
            -1L
        }

        val entry = buildString {
            append(System.currentTimeMillis())
            append(" | state=").append(currentState)
            append(" | stalls=").append(consecutiveStalls)
            append(" | errors=").append(consecutivePlaybackErrors)
            append(" | time=").append(time)
            append(" | url=").append(currentStreamUrl)
            append(" | ").append(message)
        }

        synchronized(freezeLog) {
            if (freezeLog.size >= maxFreezeLogEntries) {
                freezeLog.removeFirst()
            }
            freezeLog.addLast(entry)
        }
        Log.w("FleetFreeze", entry)
    }

    private fun dumpFreezeLogToLogcat() {
        synchronized(freezeLog) {
            Log.w("FleetFreeze", "===== Freeze log dump (${freezeLog.size} entries) =====")
            freezeLog.forEach { Log.w("FleetFreeze", it) }
            Log.w("FleetFreeze", "===== End freeze log dump =====")
        }
    }

    private fun reportFreezeToDataBridge(extraMessage: String = "Stream freeze detected") {
        scope.launch(Dispatchers.IO) {
            try {
                val reportUrl = dataBridgeUrl.replace("/api/state", "/api/device-status")
                val recent = synchronized(freezeLog) {
                    freezeLog.toList().takeLast(15).joinToString("\n")
                }
                val jsonPayload = JSONObject().apply {
                    put("status", "WARNING")
                    put("message", extraMessage)
                    put("lastFreezeTimestamp", System.currentTimeMillis())
                    put("streamUrl", currentStreamUrl)
                    put("appState", currentState.name)
                    put("consecutiveStalls", consecutiveStalls)
                    put("consecutivePlaybackErrors", consecutivePlaybackErrors)
                    put("recentFreezeLog", recent)
                }
                val body = jsonPayload.toString()
                    .toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
                val request = Request.Builder().url(reportUrl).post(body).build()
                client.newCall(request).execute().close()
                Log.i("FleetFreeze", "Freeze report sent to Data Bridge")
            } catch (e: Exception) {
                Log.e("FleetFreeze", "Failed to report freeze: ${e.message}")
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "FleetController::CpuWakeLock"
        ).apply {
            acquire(14_400_000L)
        }
    }

    override fun onPause() {
        super.onPause()
        wakeLock?.let { if (it.isHeld) it.release() }
    }

    override fun onDestroy() {
        super.onDestroy()
        watchdogJob?.cancel()
        keepaliveJob?.cancel()
        scope.cancel()
        try {
            mediaPlayer.media?.release()
            mediaPlayer.release()
            libVLC.release()
        } catch (e: Exception) {
            Log.w("MainActivity", "Release error: ${e.message}")
        }
        fleetServiceIntent?.let { stopService(it) }
    }
}
package com.se_chukei.fleetcontroller

import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.net.toUri
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.ui.PlayerView
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

    private var exoPlayer: ExoPlayer? = null
    private lateinit var exoPlayerView: PlayerView

    private var wakeLock: PowerManager.WakeLock? = null
    private var targetVolume = 100
    private var blackOverlay: View? = null

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
        ?: "http://100.74.35.53:3001/api/state"

    private val freezeLog = ArrayDeque<String>(80)
    private val maxFreezeLogEntries = 80

    private var currentStreamUrl: String? = null
    private var currentState: State = State.STANDBY
    private var fleetServiceIntent: Intent? = null

    private var lastValidStandbyUrl: String? = null
    private var lastValidStreamUrl: String? = null

    // After client-side fallback, ignore bridge attempts to re-push the same broken URL
    private var recoveryLockUntilMs: Long = 0L
    private var recoveryLockedUrl: String? = null

    private var lastCheckedPosition: Long = -1L
    private var consecutiveStalls = 0
    private var consecutivePlaybackErrors = 0
    private var consecutiveNetworkFailures = 0
    private var watchdogJob: Job? = null
    private var keepaliveJob: Job? = null

    private var softRecoveryDeadlineMs: Long = 0L
    private var awaitingSoftRecoveryProgress = false

    private var lastHardResetMs: Long = 0L
    private val hardResetCooldownMs = 120_000L

    private val standbyKeepaliveIntervalMs = 50 * 60 * 1000L
    private var lastKeepaliveMs: Long = 0L

    // ---------- Telemetry / DataBridge ----------
    private lateinit var telemetryCollector: TelemetryCollector
    private var dataBridgePoller: DataBridgePoller? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        suppressBluetoothDiscovery()

        vlcVideoLayout = findViewById(R.id.vlc_video_layout)
        exoPlayerView = findViewById(R.id.exo_player_view)

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

        blackOverlay?.apply {
            alpha = 1f
            visibility = View.VISIBLE
            bringToFront()
        }
        setPlayerVolume(0)

        val args = ArrayList<String>().apply {
            add("-vvv")
            add("--http-reconnect")
            add("--avcodec-hw=any")
        }
        libVLC = LibVLC(this, args)

        mediaPlayer = MediaPlayer(libVLC)
        mediaPlayer.attachViews(vlcVideoLayout, null, true, false)
        attachPlayerEventListener()

        initExoPlayer()

        fleetServiceIntent = Intent(this, FleetService::class.java)
        startService(fleetServiceIntent)

        startPollingDataBridge()
        startIndependentWatchdog()
        startStandbyKeepalive()

        // ---------- Start telemetry poller ----------
        telemetryCollector = TelemetryCollector(this)
        dataBridgePoller = DataBridgePoller(
            dataBridgeUrl = dataBridgeUrl,
            telemetryCollector = telemetryCollector,
            getTelemetryContext = {
                // Capture player state on the main thread
                var bitrateMbps = 0.0
                var droppedFrames = 0
                var hasPlayerError = false

                // We are already on a background thread here, so hop to main briefly
                val latch = java.util.concurrent.CountDownLatch(1)
                runOnUiThread {
                    try {
                        exoPlayer?.let { player ->
                            val bitrateBps = player.videoFormat?.bitrate ?: -1
                            bitrateMbps = if (bitrateBps > 0) {
                                String.format("%.2f", bitrateBps / 1_000_000.0).toDouble()
                            } else {
                                if (currentState == State.STREAM) 4.5 else 2.8
                            }
                            droppedFrames = player.videoDecoderCounters?.droppedBufferCount ?: 0
                            hasPlayerError = player.playerError != null
                        }
                    } finally {
                        latch.countDown()
                    }
                }
                latch.await(300, java.util.concurrent.TimeUnit.MILLISECONDS)

                DataBridgePoller.TelemetryContext(
                    deviceId = resolveDeviceId(),
                    deviceName = getDeviceName(),
                    tailscaleIp = getTailscaleIp(),
                    appState = currentState.name,
                    currentStreamUri = currentStreamUrl ?: "",
                    targetStreamUri = currentStreamUrl ?: "",
                    player = null,                       // do NOT pass the live player
                    isFallback = recoveryLockedUrl != null,
                    recoveryLockedUrl = recoveryLockedUrl,
                    versionCode = try {
                        packageManager.getPackageInfo(packageName, 0).longVersionCode.toInt()
                    } catch (e: Exception) {
                        1
                    }
                )
            },
            onStateChanged = { newState, streamUrl, accessKeyRevoked ->
                // Secondary channel – primary control still comes from the GET /api/state loop
                Log.i("MainActivity", "Poller callback → state=$newState url=$streamUrl revoked=$accessKeyRevoked")
            },
            onNetworkFailure = {
                consecutiveNetworkFailures++
                Log.w("MainActivity", "DataBridgePoller network failure (count=$consecutiveNetworkFailures)")
            }
        ).also { it.startPolling() }
    }

    // ---------- Device identity helpers ----------
    private fun resolveDeviceId(): String {
        return Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-${System.currentTimeMillis()}"
    }

    private fun getDeviceName(): String {
        return try {
            val bt = BluetoothAdapter.getDefaultAdapter()
            bt?.name?.takeIf { it.isNotBlank() } ?: android.os.Build.MODEL
        } catch (e: Exception) {
            android.os.Build.MODEL
        }
    }

    private fun getTailscaleIp(): String {
        // TODO: replace with real Tailscale IP discovery when available
        return "100.x.x.x"
    }

    private fun suppressBluetoothDiscovery() {
        val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter() ?: return
        try {
            val method = bluetoothAdapter.javaClass.getMethod("setScanMode", Int::class.java)
            method.invoke(bluetoothAdapter, BluetoothAdapter.SCAN_MODE_CONNECTABLE)
            Log.d("MainActivity", "Bluetooth discovery hidden (SCAN_MODE_CONNECTABLE)")
        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to suppress Bluetooth scan mode", e)
        }
    }

    private fun initExoPlayer() {
        if (exoPlayer == null) {
            val loadControl = DefaultLoadControl.Builder()
                .setBufferDurationsMs(1500, 5000, 500, 500)
                .build()

            val dataSourceFactory = DefaultHttpDataSource.Factory()
            val mediaSourceFactory = HlsMediaSource.Factory(dataSourceFactory)
                .setAllowChunklessPreparation(true)

            exoPlayer = ExoPlayer.Builder(this, DefaultRenderersFactory(this), mediaSourceFactory)
                .setLoadControl(loadControl)
                .build().apply {
                    addListener(object : Player.Listener {
                        override fun onPlayerError(error: PlaybackException) {
                            consecutivePlaybackErrors++
                            logFreeze("ExoPlayer error: ${error.message}")
                            Log.d("MainActivity", "ExoPlayer stream determined to be problematic")
                            Log.w("MainActivity", "ExoPlayer error (count=$consecutivePlaybackErrors)")

                            if (consecutivePlaybackErrors < 3) {
                                currentStreamUrl?.let { url ->
                                    runOnUiThread { playStream(url, isRecovery = true) }
                                }
                            } else {
                                Log.e("MainActivity", "ExoPlayer error threshold reached → falling back to standby")
                                consecutivePlaybackErrors = 0
                                recoveryLockedUrl = currentStreamUrl
                                recoveryLockUntilMs = Long.MAX_VALUE
                                runOnUiThread { fallbackToStandby() }
                            }
                        }
                    })
                }
            exoPlayerView.player = exoPlayer
        }
    }

    private fun useVlcFor(url: String): Boolean {
        val u = url.lowercase()
        return u.startsWith("rtmp://") || u.startsWith("rtsp://")
    }

    private fun forceStopImmediate() {
        try {
            mediaPlayer.stop()
            mediaPlayer.media?.release()
            mediaPlayer.media = null
        } catch (e: Exception) {
            Log.w("MainActivity", "VLC stop error: ${e.message}")
        }

        try {
            exoPlayer?.stop()
            exoPlayer?.clearMediaItems()
        } catch (e: Exception) {
            Log.w("MainActivity", "ExoPlayer stop error: ${e.message}")
        }

        vlcVideoLayout.visibility = View.GONE
        exoPlayerView.visibility = View.GONE
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
            val clampedVol = vol.coerceIn(0, 100)
            mediaPlayer.volume = clampedVol
            exoPlayer?.volume = clampedVol / 100f
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
                    Log.d("MainActivity", "VLC stream determined to be problematic")
                    Log.w("MainActivity", "VLC error/end (count=$consecutivePlaybackErrors)")

                    if (consecutivePlaybackErrors < 3) {
                        currentStreamUrl?.let { url ->
                            runOnUiThread { playStream(url, isRecovery = true) }
                        }
                    } else {
                        Log.e("MainActivity", "VLC error threshold reached → falling back to standby")
                        consecutivePlaybackErrors = 0
                        runOnUiThread { fallbackToStandby() }
                    }
                }
            }
        }
    }

    private fun startPollingDataBridge() {
        scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val request = Request.Builder()
                        .url(dataBridgeUrl)
                        .header("Connection", "close")
                        .build()
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

                                if (accessKeyRevoked) {
                                    updateState(State.STANDBY, null)
                                } else {
                                    updateState(newState, newStreamUrl)
                                }
                            }
                        } else {
                            consecutiveNetworkFailures++
                            Log.e("MainActivity", "Bridge returned non-success code: ${response.code}, keeping current playback state alive.")
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

    private fun updateState(newState: State, url: String?, isRecovery: Boolean = false) {
        val runnable = Runnable {
            val now = System.currentTimeMillis()
            if (newState == State.STREAM &&
                !url.isNullOrBlank() &&
                url == recoveryLockedUrl &&
                now < recoveryLockUntilMs
            ) {
                Log.w("MainActivity", "Ignoring bridge STREAM update for locked broken URL (recovery in progress)")
                return@Runnable
            }

            if (newState != State.STANDBY && !url.isNullOrBlank() && url != recoveryLockedUrl) {
                recoveryLockUntilMs = 0L
                recoveryLockedUrl = null
            }
            if (!url.isNullOrBlank()) {
                if (newState == State.STANDBY) {
                    lastValidStandbyUrl = url
                    Log.i("MainActivity", "Saved new good STANDBY URL: $url")
                } else {
                    lastValidStreamUrl = url
                }
            }

            val targetUrl = if (url.isNullOrBlank()) {
                when (newState) {
                    State.STANDBY -> lastValidStandbyUrl
                    State.STREAM, State.PLAYBACK -> lastValidStreamUrl ?: lastValidStandbyUrl
                }
            } else {
                url
            }

            val finalUrl = targetUrl
            val finalState = newState

            val stateChanged = finalState != currentState
            val urlChanged = finalUrl != currentStreamUrl

            currentState = finalState
            currentStreamUrl = finalUrl

            if (urlChanged) {
                consecutivePlaybackErrors = 0
                consecutiveStalls = 0
            }

            Log.i("MainActivity", "State applied → $currentState | url=$currentStreamUrl")

            fleetServiceIntent?.let {
                it.putExtra("STATE", currentState.name)
                it.putExtra("STREAM_URL", finalUrl ?: "")
                startService(it)
            }

            if (finalUrl.isNullOrBlank()) {
                stopStream()
            } else if (stateChanged || urlChanged) {
                playStream(finalUrl, isRecovery = isRecovery)
            }
        }

        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            runnable.run()
        } else {
            runOnUiThread(runnable)
        }
    }

    private fun fallbackToStandby() {
        isTransitioning.set(false)
        if (!lastValidStandbyUrl.isNullOrBlank()) {
            Log.w("MainActivity", "Falling back to last valid STANDBY URL: $lastValidStandbyUrl")
            updateState(State.STANDBY, lastValidStandbyUrl, isRecovery = true)
        } else {
            Log.e("MainActivity", "No valid standby URL available for fallback, triggering hard reset")
            recreateMediaPlayer()
        }
    }

    fun playStream(url: String, isRecovery: Boolean = false) {
        if (url.isBlank()) return

        if (!isTransitioning.compareAndSet(false, true)) {
            if (isRecovery) {
                Log.w("MainActivity", "Forcing transition gate open for recovery")
                isTransitioning.set(true)
            } else {
                Log.d("MainActivity", "Transition already in progress, skipping")
                return
            }
        }

        val engineName = if (useVlcFor(url)) "VLC" else "ExoPlayer"
        Log.i("MainActivity", "playStream ($engineName): $url recovery=$isRecovery")

        if (useVlcFor(url)) {
            vlcVideoLayout.visibility = View.VISIBLE
            vlcVideoLayout.bringToFront()
            exoPlayerView.visibility = View.GONE
        } else {
            exoPlayerView.visibility = View.VISIBLE
            exoPlayerView.bringToFront()
            vlcVideoLayout.visibility = View.GONE
        }

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

                    overlay.animate()
                        .alpha(0f)
                        .setDuration(1500)
                        .withEndAction {
                            overlay.visibility = View.GONE
                            isTransitioning.set(false)
                        }
                        .start()

                    fadeVolumeIn(from = 0, to = targetVolume, durationMs = 1500)
                }
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
            if (useVlcFor(url)) {
                val media = Media(libVLC, url.toUri()).apply {
                    setHWDecoderEnabled(true, false)
                    addOption(":network-caching=1500")
                    addOption(":live-caching=1500")
                    addOption(":http-reconnect")
                }

                mediaPlayer.stop()
                mediaPlayer.media?.release()
                mediaPlayer.media = media
                mediaPlayer.play()

                Log.i("MainActivity", "VLC playing: $url")
            } else {
                initExoPlayer()
                runOnUiThread {
                    blackOverlay?.visibility = View.GONE
                    vlcVideoLayout.visibility = View.GONE

                    exoPlayerView.visibility = View.VISIBLE
                    exoPlayerView.bringToFront()
                    exoPlayerView.player = exoPlayer
                    exoPlayerView.useController = false

                    exoPlayer?.let { player ->
                        val liveConfig = MediaItem.LiveConfiguration.Builder()
                            .setTargetOffsetMs(2000)
                            .setMinOffsetMs(1000)
                            .setMaxOffsetMs(4000)
                            .build()

                        val mediaItem = MediaItem.Builder()
                            .setUri(url.toUri())
                            .setLiveConfiguration(liveConfig)
                            .build()

                        player.setMediaItem(mediaItem)
                        player.prepare()
                        player.playWhenReady = true
                    }
                }
                Log.i("MainActivity", "ExoPlayer playing: $url")
            }

            lastCheckedPosition = -1L
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

                        val targetPlaybackUrl = if (!lastValidStandbyUrl.isNullOrBlank()) {
                            Log.w("MainActivity", "Hard reset fallback. Using lastValidStandbyUrl: $lastValidStandbyUrl")
                            currentState = State.STANDBY
                            lastValidStandbyUrl!!
                        } else {
                            currentStreamUrl ?: return@withContext
                        }

                        if (useVlcFor(targetPlaybackUrl)) {
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
                        } else {
                            try {
                                exoPlayer?.stop()
                                exoPlayer?.release()
                                exoPlayer = null
                            } catch (e: Exception) {
                                Log.w("MainActivity", "ExoPlayer teardown error: ${e.message}")
                            }
                            initExoPlayer()
                        }

                        playStream(targetPlaybackUrl, isRecovery = true)
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
            .setDuration(1500)
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

        fadeVolumeOut(from = targetVolume, to = 0, durationMs = 1500)
    }

    private fun startIndependentWatchdog() {
        watchdogJob?.cancel()
        watchdogJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(10_000)
                try {
                    val url = withContext(Dispatchers.Main) { currentStreamUrl }
                    if (url.isNullOrEmpty()) continue

                    val currentPos = withTimeoutOrNull(2000) {
                        try {
                            if (useVlcFor(url)) {
                                mediaPlayer.time
                            } else {
                                withContext(Dispatchers.Main) {
                                    exoPlayer?.currentPosition ?: 0L
                                }
                            }
                        } catch (e: Exception) {
                            null
                        }
                    }

                    if (currentPos != null && currentPos != -1L && currentPos != lastCheckedPosition) {
                        consecutiveStalls = 0
                        consecutivePlaybackErrors = 0
                        lastCheckedPosition = currentPos
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

                    if (awaitingSoftRecoveryProgress &&
                        System.currentTimeMillis() > softRecoveryDeadlineMs
                    ) {
                        logFreeze("Soft recovery deadline exceeded → falling back to standby")
                        awaitingSoftRecoveryProgress = false
                        consecutiveStalls = 0
                        withContext(Dispatchers.Main) { fallbackToStandby() }
                        continue
                    }

                    when {
                        consecutiveStalls >= 5 -> {
                            Log.e("MainActivity", "Stream determined to be severely problematic")
                            consecutiveStalls = 0
                            withContext(Dispatchers.Main) { fallbackToStandby() }
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

    private fun startStandbyKeepalive() {
        keepaliveJob?.cancel()
        lastKeepaliveMs = System.currentTimeMillis()
        keepaliveJob = scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(60_000)
                try {
                    if (currentState != State.STANDBY) continue
                    if (isTransitioning.get()) continue

                    val urlSnapshot = withContext(Dispatchers.Main) { currentStreamUrl }
                    if (urlSnapshot.isNullOrEmpty()) continue

                    val elapsed = System.currentTimeMillis() - lastKeepaliveMs
                    if (elapsed >= standbyKeepaliveIntervalMs) {
                        logFreeze("STANDBY keepalive restart")
                        Log.i("MainActivity", "STANDBY keepalive → controlled restart")
                        lastKeepaliveMs = System.currentTimeMillis()
                        withContext(Dispatchers.Main) {
                            playStream(urlSnapshot, isRecovery = true)
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
            val url = currentStreamUrl ?: ""
            if (useVlcFor(url)) mediaPlayer.time else (exoPlayer?.currentPosition ?: 0L)
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
                // Use the same /api/sync endpoint the poller uses
                val reportUrl = dataBridgeUrl.replace("/api/state", "/api/sync")
                val recent = synchronized(freezeLog) {
                    freezeLog.toList().takeLast(15).joinToString("\n")
                }
                val jsonPayload = JSONObject().apply {
                    put("deviceId", resolveDeviceId())
                    put("nodeName", getDeviceName())
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
        dataBridgePoller?.stopPolling()
        dataBridgePoller = null
        watchdogJob?.cancel()
        keepaliveJob?.cancel()
        scope.cancel()
        try {
            mediaPlayer.media?.release()
            mediaPlayer.release()
            libVLC.release()
            exoPlayer?.release()
            exoPlayer = null
        } catch (e: Exception) {
            Log.w("MainActivity", "Release error: ${e.message}")
        }
        fleetServiceIntent?.let { stopService(it) }
    }
}
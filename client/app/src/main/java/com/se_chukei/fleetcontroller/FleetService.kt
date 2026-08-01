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
import androidx.core.net.toUri
import android.os.Handler
import android.os.Looper
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlinx.coroutines.*

// Define the operational states for clarity
enum class ServiceState {
    STANDBY, STREAM, PLAYBACK
}

class FleetService : Service() {

    private lateinit var libVLC: LibVLC
    private lateinit var mediaPlayer: MediaPlayer
    private var wakeLock: PowerManager.WakeLock? = null

    private var currentState: ServiceState = ServiceState.STANDBY
    private var currentStreamUrl: String? = null

    // Telemetry reporting
    private val telemetryExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val TELEMETRY_INTERVAL_SECONDS = 10L // Report every 10 seconds

    // Media Player Watchdog
    private var mediaPlayerWatchdogJob: Job? = null
    private val WATCHDOG_CHECK_INTERVAL_MS = 5000L // Check every 5 seconds
    private val STAGNATION_THRESHOLD_MS = 10000L // Consider player stagnant after 10 seconds
    private var lastPlaybackTime: Long = 0L
    private var isPlayerStuck = false

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceWithNotification()

        // Acquire CPU WakeLock with a 4-hour timeout to prevent Android Studio warnings
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).run {
            newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FleetController::CpuWakeLock").apply {
                acquire(14400000L)
            }
        }

        // Initialize LibVLC engine with low-latency network settings
        val options = arrayListOf(
            "--rtsp-tcp",
            "--network-caching=300",
            "--clock-jitter=0",
            "--clock-synchro=0"
        )
        libVLC = LibVLC(this, options)
        mediaPlayer = MediaPlayer(libVLC)

        // Start telemetry reporting
        startTelemetryReporting()

        // Start Media Player Watchdog
        startMediaPlayerWatchdog()
    }

    private fun startMediaPlayerWatchdog() {
        mediaPlayerWatchdogJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                if (mediaPlayer.isPlaying) {
                    val currentTime = System.currentTimeMillis()
                    // Check if playback time has advanced significantly
                    if (currentTime - lastPlaybackTime > STAGNATION_THRESHOLD_MS) {
                        if (!isPlayerStuck) {
                            Log.w("FleetService", "Media player appears stuck. Attempting to restart.")
                            isPlayerStuck = true
                            // Attempt to restart playback on the main thread
                            Handler(Looper.getMainLooper()).post {
                                restartPlayback()
                            }
                        }
                    } else {
                        // Playback is progressing, reset stuck flag
                        isPlayerStuck = false
                    }
                } else {
                    // Player is not playing, reset watchdog state
                    isPlayerStuck = false
                }
                delay(WATCHDOG_CHECK_INTERVAL_MS)
            }
        }
    }

    private fun restartPlayback() {
        Log.d("FleetService", "Restarting media player...")
        // Stop current playback
        mediaPlayer.stop()

        // Re-initialize media player with current state and URL
        if (currentStreamUrl != null) {
            updatePlayback(currentState, currentStreamUrl)
        } else {
            // If no URL is available, fall back to STANDBY
            updatePlayback(ServiceState.STANDBY, null)
        }
        lastPlaybackTime = System.currentTimeMillis() // Reset timer after restart
        isPlayerStuck = false // Reset stuck flag
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val newState = intent?.getStringExtra("STATE")?.let { ServiceState.valueOf(it) } ?: ServiceState.STANDBY
        val newStreamUrl = intent?.getStringExtra("STREAM_URL")

        Log.d("FleetService", "Received command: State=$newState, URL=$newStreamUrl")

        // Update state and URL if they have changed
        if (newState != currentState || newStreamUrl != currentStreamUrl) {
            currentState = newState
            currentStreamUrl = newStreamUrl
            updatePlayback(currentState, currentStreamUrl)
        }

        return START_STICKY
    }

    private fun updatePlayback(state: ServiceState, url: String?) {
        when (state) {
            ServiceState.STANDBY -> {
                mediaPlayer.stop()
                Log.i("FleetService", "Entering STANDBY state.")
                // In a real app, you might show a specific standby graphic or UI element here.
                // For now, we just stop playback.
            }
            ServiceState.STREAM, ServiceState.PLAYBACK -> {
                if (url != null) {
                    Log.i("FleetService", "Entering ${state} state with URL: $url")
                    val media = Media(libVLC, url.toUri())
                    mediaPlayer.media = media
                    media.release()
                    mediaPlayer.play()
                    lastPlaybackTime = System.currentTimeMillis() // Update last playback time
                } else {
                    Log.e("FleetService", "${state} state requires a URL. Falling back to STANDBY.")
                    // Fallback to STANDBY if URL is missing
                    updatePlayback(ServiceState.STANDBY, null)
                }
            }
        }
    }

    private fun startTelemetryReporting() {
        telemetryExecutor.scheduleAtFixedRate({
            reportTelemetry()
        }, 0, TELEMETRY_INTERVAL_SECONDS, TimeUnit.SECONDS)
    }

    private fun reportTelemetry() {
        // In a real application, you would gather actual device metrics here.
        // For now, we'll use placeholder values and the current state.
        val deviceId = getDeviceId()
        val ipAddress = getIpAddress()
        val macAddress = getMacAddress()
        val cpuUsage = getCpuUsage()
        val memoryUsage = getMemoryUsage()
        val vlcBitrateMbps = mediaPlayer.vlcVlcBitrate() / 1000000.0 // Example: get bitrate if available
        val fps = mediaPlayer.vlcVlcFps() // Example: get FPS if available
        val droppedFrames = mediaPlayer.vlcVlcDroppedFrames() // Example: get dropped frames if available
        val temperature = getDeviceTemperature()
        val accessKeyRevoked = getAccessKeyRevokedStatus() // TODO: Implement this

        Log.d("FleetService", "Reporting telemetry: State=$currentState, URL=$currentStreamUrl")
        val telemetryData = JSONObject().apply {
            put("deviceId", deviceId)
            put("ipAddress", ipAddress)
            put("macAddress", macAddress)
            put("cpuUsage", cpuUsage)
            put("memoryUsage", memoryUsage)
            put("appState", currentState.name)
            put("activeUrl", currentStreamUrl ?: "")
            put("vlcBitrateMbps", vlcBitrateMbps)
            put("fps", fps)
            put("droppedFrames", droppedFrames)
            put("temperature", temperature)
            put("accessKeyRevoked", accessKeyRevoked)
        }
        sendTelemetryToServer(telemetryData.toString())
    }

    // Placeholder for sending telemetry data
    private fun sendTelemetryToServer(telemetryData: String) {
        // Implement actual network call here (e.g., using OkHttp)
        Log.v("FleetService", "Sending telemetry: $telemetryData")
        // Example:
        // val client = OkHttpClient()
        // val requestBody = telemetryData.toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
        // val request = Request.Builder()
        //     .url("YOUR_TELEMETRY_ENDPOINT") // TODO: Define telemetry endpoint
        //     .post(requestBody)
        //     .build()
        //
        // client.newCall(request).enqueue(object : okhttp3.Callback {
        //     override fun onFailure(call: okhttp3.Call, e: IOException) {
        //         Log.e("FleetService", "Failed to send telemetry: ${e.message}")
        //     }
        //     override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
        //         Log.d("FleetService", "Telemetry sent successfully.")
        //     }
        // })
    }

    // TODO: Implement Remote Command Listener
    // This would involve setting up a WebSocket client or similar to listen for commands
    // from the dashboard. Commands like SET_STATE, REBOOT_DEVICE, CLEAR_CACHE, UPDATE_OTA, REVOKE_ACCESS_KEY
    // would be handled here.
    private fun setupRemoteCommandListener() {
        // Example: Using a simple thread for now. In a real app, consider a dedicated library
        // for WebSocket or MQTT communication.
        thread {
            // TODO: Implement actual WebSocket/MQTT client connection and message handling
            Log.d("FleetService", "Remote command listener started (placeholder).")
            // Example:
            // val client = WebSocketClient(...)
            // client.connect()
            // while(true) {
            //     val message = client.receiveMessage()
            //     handleCommand(message)
            // }
        }
    }

    private fun handleCommand(command: String) {
        // TODO: Parse command and execute actions
        Log.d("FleetService", "Received command: $command")
        when (command) {
            "REBOOT_DEVICE" -> {
                // Implement device reboot logic
            }
            "CLEAR_CACHE" -> {
                // Implement cache clearing logic
            }
            "UPDATE_OTA" -> {
                // Implement OTA update logic
            }
            "REVOKE_ACCESS_KEY" -> {
                // Implement access key revocation logic
                // This might involve setting a flag and transitioning to STANDBY
                Log.e("FleetService", "Access key revoked via command.")
                // updatePlayback(ServiceState.STANDBY, null) // This would need to be called on the main thread or via a handler
            }
            // ... other commands
        }
    }

    private fun startForegroundServiceWithNotification() {



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
        wakeLock?.release()
        mediaPlayer.stop()
        mediaPlayer.release()
        libVLC.release()
        telemetryExecutor.shutdown() // Shutdown the telemetry executor
        mediaPlayerWatchdogJob?.cancel() // Cancel the watchdog job
        super.onDestroy()
    }
}

// Helper extension functions for LibVLC MediaPlayer to get stats (if available)
// These might need to be adapted based on the actual LibVLC API and availability
fun MediaPlayer.vlcVlcBitrate(): Long {
    // This is a placeholder. Actual bitrate retrieval might be complex or unavailable directly.
    // You might need to use specific LibVLC event listeners or callbacks.
    return 0L
}

fun MediaPlayer.vlcVlcFps(): Float {
    // This is a placeholder. Actual FPS retrieval might be complex or unavailable directly.
    return 0f
}

fun MediaPlayer.vlcVlcDroppedFrames(): Long {
    // This is a placeholder. Actual dropped frames retrieval might be complex or unavailable directly.
    return 0L
}

// Helper functions to get device information
// These are placeholders and will need actual implementation using Android APIs.
fun FleetService.getDeviceId(): String = "DEVICE_ID_PLACEHOLDER" // TODO: Implement actual device ID retrieval
fun FleetService.getIpAddress(): String = "IP_ADDRESS_PLACEHOLDER" // TODO: Implement actual IP address retrieval
fun FleetService.getMacAddress(): String = "MAC_ADDRESS_PLACEHOLDER" // TODO: Implement actual MAC address retrieval
fun FleetService.getCpuUsage(): Double = 0.0 // TODO: Implement actual CPU usage retrieval
fun FleetService.getMemoryUsage(): Double = 0.0 // TODO: Implement actual memory usage retrieval
fun FleetService.getDeviceTemperature(): Double = 0.0 // TODO: Implement actual device temperature retrieval
fun FleetService.getAccessKeyRevokedStatus(): Boolean = false // TODO: Implement actual access key status retrieval



// Define the operational states for clarity
enum class ServiceState {
    STANDBY, STREAM, PLAYBACK
}

class FleetService : Service() {

    private lateinit var libVLC: LibVLC
    private lateinit var mediaPlayer: MediaPlayer
    private var wakeLock: PowerManager.WakeLock? = null

    private var currentState: ServiceState = ServiceState.STANDBY
    private var currentStreamUrl: String? = null

    // Telemetry reporting
    private val telemetryExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val TELEMETRY_INTERVAL_SECONDS = 10L // Report every 10 seconds

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceWithNotification()

        // Acquire CPU WakeLock with a 4-hour timeout to prevent Android Studio warnings
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).run {
            newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FleetController::CpuWakeLock").apply {
                acquire(14400000L)
            }
        }

        // Initialize LibVLC engine with low-latency network settings
        val options = arrayListOf(
            "--rtsp-tcp",
            "--network-caching=300",
            "--clock-jitter=0",
            "--clock-synchro=0"
        )
        libVLC = LibVLC(this, options)
        mediaPlayer = MediaPlayer(libVLC)

        // Start telemetry reporting
        startTelemetryReporting()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val newState = intent?.getStringExtra("STATE")?.let { ServiceState.valueOf(it) } ?: ServiceState.STANDBY
        val newStreamUrl = intent?.getStringExtra("STREAM_URL")

        Log.d("FleetService", "Received command: State=$newState, URL=$newStreamUrl")

        // Update state and URL if they have changed
        if (newState != currentState || newStreamUrl != currentStreamUrl) {
            currentState = newState
            currentStreamUrl = newStreamUrl
            updatePlayback(currentState, currentStreamUrl)
        }

        return START_STICKY
    }

    private fun updatePlayback(state: ServiceState, url: String?) {
        when (state) {
            ServiceState.STANDBY -> {
                mediaPlayer.stop()
                Log.i("FleetService", "Entering STANDBY state.")
                // In a real app, you might show a specific standby graphic or UI element here.
                // For now, we just stop playback.
            }
            ServiceState.STREAM, ServiceState.PLAYBACK -> {
                if (url != null) {
                    Log.i("FleetService", "Entering ${state} state with URL: $url")
                    val media = Media(libVLC, url.toUri())
                    mediaPlayer.media = media
                    media.release()
                    mediaPlayer.play()
                } else {
                    Log.e("FleetService", "${state} state requires a URL. Falling back to STANDBY.")
                    // Fallback to STANDBY if URL is missing
                    updatePlayback(ServiceState.STANDBY, null)
                }
            }
        }
    }

    private fun startTelemetryReporting() {
        telemetryExecutor.scheduleAtFixedRate({
            reportTelemetry()
        }, 0, TELEMETRY_INTERVAL_SECONDS, TimeUnit.SECONDS)
    }

    private fun reportTelemetry() {
        // In a real application, you would gather actual device metrics here.
        // For now, we'll use placeholder values and the current state.
        val deviceId = getDeviceId()
        val ipAddress = getIpAddress()
        val macAddress = getMacAddress()
        val cpuUsage = getCpuUsage()
        val memoryUsage = getMemoryUsage()
        val vlcBitrateMbps = mediaPlayer.vlcVlcBitrate() / 1000000.0 // Example: get bitrate if available
        val fps = mediaPlayer.vlcVlcFps() // Example: get FPS if available
        val droppedFrames = mediaPlayer.vlcVlcDroppedFrames() // Example: get dropped frames if available
        val temperature = getDeviceTemperature()
        val accessKeyRevoked = getAccessKeyRevokedStatus() // TODO: Implement this

        Log.d("FleetService", "Reporting telemetry: State=$currentState, URL=$currentStreamUrl")
        val telemetryData = JSONObject().apply {
            put("deviceId", deviceId)
            put("ipAddress", ipAddress)
            put("macAddress", macAddress)
            put("cpuUsage", cpuUsage)
            put("memoryUsage", memoryUsage)
            put("appState", currentState.name)
            put("activeUrl", currentStreamUrl ?: "")
            put("vlcBitrateMbps", vlcBitrateMbps)
            put("fps", fps)
            put("droppedFrames", droppedFrames)
            put("temperature", temperature)
            put("accessKeyRevoked", accessKeyRevoked)
        }
        sendTelemetryToServer(telemetryData.toString())
    }

    // Placeholder for sending telemetry data
    private fun sendTelemetryToServer(telemetryData: String) {
        // Implement actual network call here (e.g., using OkHttp)
        Log.v("FleetService", "Sending telemetry: $telemetryData")
        // Example:
        // val client = OkHttpClient()
        // val requestBody = telemetryData.toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
        // val request = Request.Builder()
        //     .url("YOUR_TELEMETRY_ENDPOINT") // TODO: Define telemetry endpoint
        //     .post(requestBody)
        //     .build()
        //
        // client.newCall(request).enqueue(object : okhttp3.Callback {
        //     override fun onFailure(call: okhttp3.Call, e: IOException) {
        //         Log.e("FleetService", "Failed to send telemetry: ${e.message}")
        //     }
        //     override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
        //         Log.d("FleetService", "Telemetry sent successfully.")
        //     }
        // })
    }

    // TODO: Implement Remote Command Listener
    // This would involve setting up a WebSocket client or similar to listen for commands
    // from the dashboard. Commands like SET_STATE, REBOOT_DEVICE, CLEAR_CACHE, UPDATE_OTA, REVOKE_ACCESS_KEY
    // would be handled here.
    private fun setupRemoteCommandListener() {
        // Example: Using a simple thread for now. In a real app, consider a dedicated library
        // for WebSocket or MQTT communication.
        thread {
            // TODO: Implement actual WebSocket/MQTT client connection and message handling
            Log.d("FleetService", "Remote command listener started (placeholder).")
            // Example:
            // val client = WebSocketClient(...)
            // client.connect()
            // while(true) {
            //     val message = client.receiveMessage()
            //     handleCommand(message)
            // }
        }
    }

    private fun handleCommand(command: String) {
        // TODO: Parse command and execute actions
        Log.d("FleetService", "Received command: $command")
        when (command) {
            "REBOOT_DEVICE" -> {
                // Implement device reboot logic
            }
            "CLEAR_CACHE" -> {
                // Implement cache clearing logic
            }
            "UPDATE_OTA" -> {
                // Implement OTA update logic
            }
            "REVOKE_ACCESS_KEY" -> {
                // Implement access key revocation logic
                // This might involve setting a flag and transitioning to STANDBY
                Log.e("FleetService", "Access key revoked via command.")
                // updatePlayback(ServiceState.STANDBY, null) // This would need to be called on the main thread or via a handler
            }
            // ... other commands
        }
    }

    private fun startForegroundServiceWithNotification() {



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
        wakeLock?.release()
        mediaPlayer.stop()
        mediaPlayer.release()
        libVLC.release()
        telemetryExecutor.shutdown() // Shutdown the telemetry executor
        super.onDestroy()
    }
}

// Helper extension functions for LibVLC MediaPlayer to get stats (if available)
// These might need to be adapted based on the actual LibVLC API and availability
fun MediaPlayer.vlcVlcBitrate(): Long {
    // This is a placeholder. Actual bitrate retrieval might be complex or unavailable directly.
    // You might need to use specific LibVLC event listeners or callbacks.
    return 0L
}

fun MediaPlayer.vlcVlcFps(): Float {
    // This is a placeholder. Actual FPS retrieval might be complex or unavailable directly.
    return 0f
}

fun MediaPlayer.vlcVlcDroppedFrames(): Long {
    // This is a placeholder. Actual dropped frames retrieval might be complex or unavailable directly.
    return 0L
}


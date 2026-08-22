package com.se_chukei.fleetcontroller

import android.util.Log
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.random.Random

class DataBridgePoller(
    private val dataBridgeUrl: String, 
    private val telemetryCollector: TelemetryCollector,
    private val getTelemetryContext: () -> TelemetryContext,
    private val onStateChanged: (newState: String, streamUrl: String, accessKeyRevoked: Boolean) -> Unit,
    private val onNetworkFailure: () -> Unit
) {
    data class TelemetryContext(
        val deviceId: String,
        val deviceName: String,
        val tailscaleIp: String,
        val appState: String,
        val currentStreamUri: String,
        val targetStreamUri: String,
        val player: ExoPlayer?,
        val isFallback: Boolean,
        val recoveryLockedUrl: String?,
        val versionCode: Int
    )

    private val tag = "DataBridgePoller"
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private var pollingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    private var lastState: String? = null
    private var lastUrl: String? = null

    private var consecutiveFailures = 0
    private val baseIntervalMs = 2000L
    private val maxBackoffMs = 30000L

    fun startPolling() {
        if (pollingJob?.isActive == true) return

        pollingJob = scope.launch {
            Log.d(tag, "Starting Data Bridge sync/telemetry loop with backoff support...")
            while (isActive) {
                var currentDelay = baseIntervalMs

                try {
                    syncAndPoll()
                    consecutiveFailures = 0
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    consecutiveFailures++
                    Log.w(tag, "Sync error (attempt $consecutiveFailures): ${e.message}")
                    
                    if (consecutiveFailures >= 3) {
                        onNetworkFailure()
                    }
                }

                if (consecutiveFailures > 0) {
                    val exponentialMultiplier = min(maxBackoffMs, baseIntervalMs * (1 shl min(consecutiveFailures - 1, 5)))
                    val jitterMs = Random.nextLong(500L, 2000L)
                    currentDelay = exponentialMultiplier + jitterMs
                } else {
                    currentDelay = baseIntervalMs + Random.nextLong(1000L, 3001L)
                }

                delay(currentDelay)
            }
        }
    }

    private fun syncAndPoll() {
        val ctx = getTelemetryContext()
        val payload = telemetryCollector.collect(
            deviceId = ctx.deviceId,
            deviceName = ctx.deviceName,
            tailscaleIp = ctx.tailscaleIp,
            appState = ctx.appState,
            currentStreamUri = ctx.currentStreamUri,
            targetStreamUri = ctx.targetStreamUri,
            player = ctx.player,
            isFallback = ctx.isFallback,
            recoveryLockedUrl = ctx.recoveryLockedUrl,
            versionCode = ctx.versionCode
        )

        val jsonPayload = JSONObject().apply {
            // Strict alignment with server's expected telemetry schema
            put("deviceId", payload.id)
            put("nodeName", payload.name)
            put("nodeIp", payload.tailscaleIp)
            put("status", payload.status)
            put("bitrate", payload.bitrateMbps)
            put("temp", payload.deviceTempC)
            put("cpu", payload.cpuUsagePercent)
            put("streamUrl", payload.streamUri) 
            
            // Retained extended payload details for logging/diagnostics
            put("appState", payload.appState)
            put("powerState", payload.powerState)
            put("activePlayer", payload.activePlayer)
            put("playerViewType", payload.playerViewType)
            put("troubleshootActive", payload.troubleshootActive)
            put("versionCode", payload.versionCode)
            put("lastSeenMs", payload.lastSeenMs)
            put("usbAttached", payload.usbAttached)
            put("usbDebounceCountdown", payload.usbDebounceCountdown ?: JSONObject.NULL)
            put("watchdogStep", payload.watchdogStep ?: JSONObject.NULL)
            put("targetStreamUri", payload.targetStreamUri)
            put("streamId", payload.streamId)
            put("isDormant", payload.isDormant)
            put("isDecommissioned", payload.isDecommissioned)
            put("isOverridden", payload.isOverridden)
            put("accessKeyRevoked", payload.accessKeyRevoked)
            put("droppedFrames", payload.droppedFrames)
        }.toString()

        val apiIndex = dataBridgeUrl.indexOf("/api")
        val syncUrl = if (apiIndex != -1) {
            dataBridgeUrl.substring(0, apiIndex) + "/api/sync"
        } else {
            dataBridgeUrl.trimEnd('/') + "/api/sync"
        }

        val request = Request.Builder()
            .url(syncUrl)
            .post(jsonPayload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Data bridge returned error code: ${response.code}")
            }

            val responseBody = response.body?.string() ?: throw IOException("Empty response body")
            parseAndDispatch(responseBody)
        }
    }

    private fun parseAndDispatch(jsonString: String) {
        try {
            val json = JSONObject(jsonString)
            val appState = json.optString("appState", "STANDBY")
            val streamUrl = json.optString("streamUrl", "")
            val accessKeyRevoked = json.optBoolean("accessKeyRevoked", false)

            if (appState != lastState || streamUrl != lastUrl) {
                Log.d(tag, "State change detected! New State: $appState, URL: $streamUrl")
                lastState = appState
                lastUrl = streamUrl
                onStateChanged(appState, streamUrl, accessKeyRevoked)
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to parse data bridge payload: ${e.message}")
        }
    }

    fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
        Log.d(tag, "Data Bridge polling stopped.")
    }
}
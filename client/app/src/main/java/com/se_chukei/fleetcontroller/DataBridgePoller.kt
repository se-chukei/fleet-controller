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
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.random.Random

class DataBridgePoller(
    private val dataBridgeUrl: String,
    private val telemetryCollector: TelemetryCollector,
    private val getTelemetryContext: () -> TelemetryContext,
    private val onStateChanged: (newState: String, streamUrl: String, accessKeyRevoked: Boolean, fleetState: String, fleetStreamUrl: String, eventTitle: String, streamEventId: String, streamStartedAt: Long?, streamExpiresAt: Long?) -> Unit,
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
        val versionCode: Int,
        val uptimeSeconds: Long = 0L,
        val precomputedBitrateMbps: Double? = null,
        val precomputedDroppedFrames: Int? = null,
        val precomputedHasError: Boolean? = null,
        val precomputedStreamResolution: String? = null,   // ← must exist
        val consecutiveStalls: Int = 0,
        val consecutivePlaybackErrors: Int = 0,
        val consecutiveNetworkFailures: Int = 0,
        val mainDisplayName: String = "テスト拠点1"
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
    private var lastStreamEventId: String? = null
    private var lastStreamExpiresAt: Long? = null

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
                    val exponentialMultiplier = min(
                        maxBackoffMs,
                        baseIntervalMs * (1 shl min(consecutiveFailures - 1, 5))
                    )
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
            versionCode = ctx.versionCode,
            uptimeSeconds = ctx.uptimeSeconds,
            precomputedBitrateMbps = ctx.precomputedBitrateMbps,
            precomputedDroppedFrames = ctx.precomputedDroppedFrames,
            precomputedHasError = ctx.precomputedHasError,
            precomputedStreamResolution = ctx.precomputedStreamResolution,
            consecutiveStalls = ctx.consecutiveStalls,
            consecutivePlaybackErrors = ctx.consecutivePlaybackErrors,
            consecutiveNetworkFailures = ctx.consecutiveNetworkFailures
        )

        val jsonPayload = JSONObject().apply {
            put("deviceId", payload.id)
            put("nodeName", ctx.mainDisplayName)
            put("deviceName", payload.name)
            put("nodeIp", payload.tailscaleIp)
            put("status", payload.status)
            put("bitrate", payload.bitrateMbps)
            put("temp", payload.deviceTempC)
            put("status", payload.status)
            put("bitrate", payload.bitrateMbps)
            put("streamResolution", payload.streamResolution)
            put("temp", payload.deviceTempC)
            put("cpu", payload.cpuUsagePercent)
            put("streamUrl", payload.streamUri)
            put("powerState", payload.powerState)
            put("uptimeSeconds", payload.uptimeSeconds)

            put("appState", payload.appState)
            put("activePlayer", payload.activePlayer)
            put("playerViewType", payload.playerViewType)
            put("troubleshootActive", payload.troubleshootActive)
            put("versionCode", payload.versionCode)
            put("lastSeenMs", payload.lastSeenMs)
            put("deviceLocale", payload.deviceLocale)
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
            put("consecutiveStalls", payload.consecutiveStalls)
            put("consecutivePlaybackErrors", payload.consecutivePlaybackErrors)
            put("consecutiveNetworkFailures", payload.consecutiveNetworkFailures)
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

            val responseBody = response.body?.string()
                ?: throw IOException("Empty response body")
            parseAndDispatch(responseBody, ctx)
        }
    }

    private fun parseAndDispatch(jsonString: String, currentCtx: TelemetryContext) {
        try {
            val json = JSONObject(jsonString)
            // Primary field: appState, fallback: status
            val appState = if (json.has("appState")) {
                json.optString("appState", "STANDBY")
            } else {
                json.optString("status", "STANDBY")
            }
            
            val streamUrl = if (json.isNull("streamUrl")) "" else json.optString("streamUrl", "")
            val accessKeyRevoked = json.optBoolean("accessKeyRevoked", false)
            val fleetState = json.optString("fleetAppState", appState)
            val fleetStreamUrl = json.optString("fleetStreamUrl", "")
            val eventTitle = json.optString("eventTitle", "")
            val streamEventId = json.optString("streamEventId", "")
            val streamStartedAt = json.optLong("streamStartedAt", 0L).takeIf { it > 0L }
            val streamExpiresAt = json.optLong("streamExpiresAt", 0L).takeIf { it > 0L }

            val stateChanged = appState != lastState || appState != currentCtx.appState
            val urlChanged = streamUrl != lastUrl || streamUrl != currentCtx.targetStreamUri
            val expiryChanged = streamEventId != lastStreamEventId || streamExpiresAt != lastStreamExpiresAt

            if (stateChanged || urlChanged || expiryChanged) {
                Log.d(tag, "State/URL change detected in sync response! New State: $appState, URL: $streamUrl")
                lastState = appState
                lastUrl = streamUrl
                lastStreamEventId = streamEventId
                lastStreamExpiresAt = streamExpiresAt
                onStateChanged(appState, streamUrl, accessKeyRevoked, fleetState, fleetStreamUrl, eventTitle, streamEventId, streamStartedAt, streamExpiresAt)
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
package com.se_chukei.fleetcontroller

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.random.Random

class DataBridgePoller(
    private val dataBridgeUrl: String, 
    private val onStateChanged: (newState: String, streamUrl: String, accessKeyRevoked: Boolean) -> Unit,
    private val onNetworkFailure: () -> Unit // Added callback for fallback triggers
) {
    private val tag = "DataBridgePoller"
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private var pollingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    private var lastState: String? = null
    private var lastUrl: String? = null

    // Backoff tracking fields
    private var consecutiveFailures = 0
    private val baseIntervalMs = 2000L
    private val maxBackoffMs = 30000L // Cap max backoff at 30 seconds

    fun startPolling() {
        if (pollingJob?.isActive == true) return

        pollingJob = scope.launch {
            Log.d(tag, "Starting Data Bridge polling loop with backoff support...")
            while (isActive) {
                var currentDelay = baseIntervalMs

                try {
                    pollBridge()
                    // Success! Reset consecutive failure count
                    consecutiveFailures = 0
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    consecutiveFailures++
                    Log.w(tag, "Poll error (attempt $consecutiveFailures): ${e.message}")
                    
                    // Trigger fallback layer if we experience persistent failures
                    if (consecutiveFailures >= 3) {
                        onNetworkFailure()
                    }
                }

                // Compute exponential backoff with jitter: base * 2^(failures-1) + random jitter
                if (consecutiveFailures > 0) {
                    val exponentialMultiplier = min(maxBackoffMs, baseIntervalMs * (1 shl min(consecutiveFailures - 1, 5)))
                    val jitterMs = Random.nextLong(500L, 2000L)
                    currentDelay = exponentialMultiplier + jitterMs
                } else {
                    // Standard jittered delay on normal successful ticks
                    currentDelay = baseIntervalMs + Random.nextLong(1000L, 3001L)
                }

                delay(currentDelay)
            }
        }
    }

    private fun pollBridge() {
        val request = Request.Builder()
            .url(dataBridgeUrl)
            .get()
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
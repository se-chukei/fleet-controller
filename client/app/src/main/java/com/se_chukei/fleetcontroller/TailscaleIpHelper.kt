package com.se_chukei.fleetcontroller

import android.util.Log
import java.net.NetworkInterface
import java.util.Collections

/**
 * Best-effort Tailscale IPv4 discovery (Method 2 – interface scan).
 * Looks for an address in the Tailscale CGNAT range 100.64.0.0/10.
 * Falls back to a placeholder when none is found.
 */
object TailscaleIpHelper {

    private const val TAG = "TailscaleIpHelper"
    private const val FALLBACK = "100.x.x.x"

    fun getTailscaleIpv4(): String {
        return try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                if (!intf.isUp) continue
                val addrs = Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (addr.isLoopbackAddress) continue
                    val host = addr.hostAddress ?: continue
                    val ip = host.split("%").first()
                    if (isTailscaleCgnat(ip)) {
                        Log.d(TAG, "Found Tailscale IP: $ip on ${intf.name}")
                        return ip
                    }
                }
            }
            Log.w(TAG, "No Tailscale IP found, using fallback")
            FALLBACK
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resolve Tailscale IP: ${e.message}")
            FALLBACK
        }
    }

    private fun isTailscaleCgnat(ip: String): Boolean {
        val parts = ip.split(".")
        if (parts.size != 4) return false
        return try {
            val a = parts[0].toInt()
            val b = parts[1].toInt()
            a == 100 && b in 64..127
        } catch (e: Exception) {
            false
        }
    }
}
package com.se_chukei.fleetcontroller

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Boot completed. Starting FleetService.")
            val serviceIntent = Intent(context, FleetService::class.java)
            // You might need to pass initial state or URL here if FleetService requires it on startup
            // For now, assuming FleetService can start in a default state or fetch it itself.
            context?.startService(serviceIntent)
        }
    }
}

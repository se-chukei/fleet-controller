package com.se_chukei.fleetcontroller

import android.content.Context
import android.os.Bundle
import android.util.Log

class VlcNetworkStreamModule(override val targetState: State) : BaseFeatureModule {

    private var currentUrl: String? = null
    private var activeContext: Context? = null

    override fun onStateEnter(context: Context, arguments: Bundle?) {
        activeContext = context
        val url = arguments?.getString("streamUrl")
        Log.d("VlcNetworkStreamModule", "onStateEnter with state $targetState and URL: $url")
        currentUrl = url
        if (context is MainActivity) {
            if (url != null && url.isNotEmpty()) {
                context.playStream(url)
            } else {
                context.stopStream()
            }
        }
    }

    override fun onConfigurationUpdate(arguments: Bundle?) {
        val url = arguments?.getString("streamUrl")
        Log.d("VlcNetworkStreamModule", "onConfigurationUpdate with state $targetState and URL: $url")
        if (url != currentUrl) {
            currentUrl = url
            val context = activeContext
            if (context is MainActivity && url != null && url.isNotEmpty()) {
                context.playStream(url)
            }
        }
    }

    override fun onStateExit(context: Context) {
        Log.d("VlcNetworkStreamModule", "onStateExit with state $targetState")
        if (context is MainActivity) {
            context.stopStream()
        }
        activeContext = null
    }
}

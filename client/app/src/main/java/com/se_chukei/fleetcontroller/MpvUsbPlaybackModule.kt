package com.se_chukei.fleetcontroller

import android.content.Context
import android.os.Bundle
import android.util.Log

class MpvUsbPlaybackModule : BaseFeatureModule {

    override val targetState: State = State.PLAYBACK
    private var activeContext: Context? = null

    override fun onStateEnter(context: Context, arguments: Bundle?) {
        activeContext = context
        Log.d("MpvUsbPlaybackModule", "onStateEnter with state $targetState")
        if (context is MainActivity) {
            context.startUsbPlayback()
        }
    }

    override fun onConfigurationUpdate(arguments: Bundle?) {
        Log.d("MpvUsbPlaybackModule", "onConfigurationUpdate")
    }

    override fun onStateExit(context: Context) {
        Log.d("MpvUsbPlaybackModule", "onStateExit")
        if (context is MainActivity) {
            context.stopUsbPlayback()
        }
        activeContext = null
    }
}

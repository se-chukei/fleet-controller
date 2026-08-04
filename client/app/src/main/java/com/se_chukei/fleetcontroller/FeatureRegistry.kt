package com.se_chukei.fleetcontroller

import android.content.Context
import android.os.Bundle
import android.util.Log

class FeatureRegistry(private val context: Context) {

    private val modules = mutableMapOf<State, BaseFeatureModule>()
    private var activeState: State? = null

    init {
        // Register modules as defined in TECHNICAL_SPEC.md & SYSTEM_DESIGN.md
        registerModule(State.STANDBY, VlcNetworkStreamModule(State.STANDBY))
        registerModule(State.STREAM, VlcNetworkStreamModule(State.STREAM))
        registerModule(State.PLAYBACK, VlcNetworkStreamModule(State.PLAYBACK))
    }

    fun registerModule(state: State, module: BaseFeatureModule) {
        modules[state] = module
    }

    fun transitionTo(newState: State, arguments: Bundle?) {
        Log.d("FeatureRegistry", "Transitioning state: $activeState -> $newState")
        if (activeState == newState) {
            // Same State: onConfigurationUpdate()
            modules[newState]?.onConfigurationUpdate(arguments)
        } else {
            // State Change: onStateExit() on active, then onStateEnter() on new state module
            activeState?.let { currentState ->
                modules[currentState]?.onStateExit(context)
            }
            activeState = newState
            modules[newState]?.onStateEnter(context, arguments)
        }
    }

    fun getActiveState(): State? = activeState
}

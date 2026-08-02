package com.se_chukei.fleetcontroller

import android.content.Context
import android.os.Bundle

interface BaseFeatureModule {

    val targetState: State

    fun onStateEnter(
        context: Context,
        arguments: Bundle?
    )

    fun onConfigurationUpdate(
        arguments: Bundle?
    )

    fun onStateExit(
        context: Context
    )
}

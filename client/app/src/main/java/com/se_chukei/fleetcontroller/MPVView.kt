package com.se_chukei.fleetcontroller

import android.content.Context
import android.util.AttributeSet
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.util.Log

class MPVView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : SurfaceView(context, attrs, defStyleAttr), SurfaceHolder.Callback {

    private val TAG = "MPVView"

    init {
        holder.addCallback(this)
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        Log.i(TAG, "surfaceCreated: attaching surface to MPVLib")
        MPVLib.safeAttachSurface(holder.surface)
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        Log.i(TAG, "surfaceChanged: width=$width, height=$height")
        // Trigger render configure updates
        MPVLib.safeCommand(arrayOf("video-reconfig"))
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        Log.i(TAG, "surfaceDestroyed: detaching surface from MPVLib")
        MPVLib.safeDetachSurface()
    }
}

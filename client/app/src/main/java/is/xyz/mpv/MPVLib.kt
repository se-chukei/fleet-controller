package `is`.xyz.mpv

import android.content.Context
import android.graphics.Bitmap
import android.view.Surface
import android.util.Log

@Suppress("unused")
object MPVLib {
    private const val TAG = "MPVLib"
    private var isLibraryLoaded = false

    init {
        try {
            System.loadLibrary("mpv")
            isLibraryLoaded = true
            Log.i(TAG, "Successfully loaded native libmpv library.")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "UnsatisfiedLinkError: Could not load native libmpv library. Using mock backend.", e)
            isLibraryLoaded = false
        }
    }

    // JNI Native methods matching libmpv's typical API bindings under is.xyz.mpv
    @JvmStatic external fun create(appctx: Context, logLvl: String)
    @JvmStatic external fun init()
    @JvmStatic external fun destroy()
    @JvmStatic external fun attachSurface(surface: Surface)
    @JvmStatic external fun detachSurface()
    @JvmStatic external fun command(cmd: Array<String>)
    @JvmStatic external fun setOptionString(name: String, value: String): Int
    @JvmStatic external fun grabThumbnail(dimension: Int): Bitmap?
    @JvmStatic external fun getPropertyInt(property: String): Int?
    @JvmStatic external fun setPropertyInt(property: String, value: Int)
    @JvmStatic external fun getPropertyDouble(property: String): Double?
    @JvmStatic external fun setPropertyDouble(property: String, value: Double)
    @JvmStatic external fun getPropertyBoolean(property: String): Boolean?
    @JvmStatic external fun setPropertyBoolean(property: String, value: Boolean)
    @JvmStatic external fun getPropertyString(property: String): String?
    @JvmStatic external fun setPropertyString(property: String, value: String)
    @JvmStatic external fun observeProperty(property: String, format: Int)

    // Fallback Mock Implementations to ensure headless/test execution doesn't crash on UnsatisfiedLinkError
    fun safeCreate(appctx: Context, logLvl: String) {
        if (isLibraryLoaded) {
            try {
                create(appctx, logLvl)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI create failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: create player with log level $logLvl")
        }
    }

    fun safeInit() {
        if (isLibraryLoaded) {
            try {
                init()
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI init failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: init player")
        }
    }

    fun safeDestroy() {
        if (isLibraryLoaded) {
            try {
                destroy()
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI destroy failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: destroy player")
        }
    }

    fun safeAttachSurface(surface: Surface) {
        if (isLibraryLoaded) {
            try {
                attachSurface(surface)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI attachSurface failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: attachSurface $surface")
        }
    }

    fun safeDetachSurface() {
        if (isLibraryLoaded) {
            try {
                detachSurface()
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI detachSurface failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: detachSurface")
        }
    }

    fun safeCommand(cmd: Array<String>) {
        if (isLibraryLoaded) {
            try {
                command(cmd)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI command failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: running command: ${cmd.joinToString(" ")}")
        }
    }

    fun safeSetOptionString(name: String, value: String): Int {
        if (isLibraryLoaded) {
            return try {
                setOptionString(name, value)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI setOptionString failed.", e)
                -1
            }
        } else {
            Log.w(TAG, "Mock: setOptionString $name = $value")
            return 0
        }
    }

    fun safeGetPropertyString(property: String): String? {
        if (isLibraryLoaded) {
            return try {
                getPropertyString(property)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI getPropertyString failed.", e)
                null
            }
        } else {
            Log.w(TAG, "Mock: getPropertyString $property")
            return null
        }
    }

    fun safeSetPropertyString(property: String, value: String) {
        if (isLibraryLoaded) {
            try {
                setPropertyString(property, value)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Fallback: JNI setPropertyString failed.", e)
            }
        } else {
            Log.w(TAG, "Mock: setPropertyString $property = $value")
        }
    }

    // Observer structures matching mpv specifications
    interface EventObserver {
        fun eventProperty(property: String)
        fun eventProperty(property: String, value: Long)
        fun eventProperty(property: String, value: Boolean)
        fun eventProperty(property: String, value: String)
        fun event(eventId: Int)
        fun efEvent(err: String)
    }

    private val observers = mutableListOf<EventObserver>()

    fun addObserver(o: EventObserver) {
        synchronized(observers) { observers.add(o) }
    }

    fun removeObserver(o: EventObserver) {
        synchronized(observers) { observers.remove(o) }
    }

    // Callbacks from JNI thread
    @JvmStatic
    fun eventProperty(property: String, value: Long) {
        synchronized(observers) {
            observers.forEach { it.eventProperty(property, value) }
        }
    }

    @JvmStatic
    fun eventProperty(property: String, value: Boolean) {
        synchronized(observers) {
            observers.forEach { it.eventProperty(property, value) }
        }
    }

    @JvmStatic
    fun eventProperty(property: String, value: String) {
        synchronized(observers) {
            observers.forEach { it.eventProperty(property, value) }
        }
    }

    @JvmStatic
    fun eventProperty(property: String) {
        synchronized(observers) {
            observers.forEach { it.eventProperty(property) }
        }
    }

    @JvmStatic
    fun event(eventId: Int) {
        synchronized(observers) {
            observers.forEach { it.event(eventId) }
        }
    }

    @JvmStatic
    fun efEvent(err: String) {
        synchronized(observers) {
            observers.forEach { it.efEvent(err) }
        }
    }

    object MpvEventId {
        const val MPV_EVENT_NONE = 0
        const val MPV_EVENT_SHUTDOWN = 1
        const val MPV_EVENT_LOG_MESSAGE = 2
        const val MPV_EVENT_GET_PROPERTY_REPLY = 3
        const val MPV_EVENT_SET_PROPERTY_REPLY = 4
        const val MPV_EVENT_COMMAND_REPLY = 5
        const val MPV_EVENT_START_FILE = 6
        const val MPV_EVENT_END_FILE = 7
        const val MPV_EVENT_FILE_LOADED = 8
        const val MPV_EVENT_PROPERTY_CHANGE = 22
    }
}

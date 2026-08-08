package com.se_chukei.fleetcontroller

import android.content.Context
import android.os.FileObserver
import android.util.Log
import kotlinx.coroutines.*
import java.io.File

class UsbMediaScraper(
    private val context: Context,
    private val onPlaylistUpdated: (List<File>) -> Unit
) {

    private val TAG = "UsbMediaScraper"
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Set of allowed media formats as requested
    private val mediaExtensions = setOf("mp4", "mkv", "mov", "mp3")

    // Possible mount points on Android devices for USB
    private val usbMountRoots = listOf("/storage", "/mnt/media_rw", "/mnt")
    private var observers = mutableListOf<FileObserver>()
    private var currentPlaylist = mutableListOf<File>()

    init {
        Log.i(TAG, "Initializing USB Media Scraper")
        startScraping()
    }

    /**
     * Scans standard directory roots for USB devices asynchronously on a background thread.
     */
    fun startScraping() {
        Log.i(TAG, "Triggering asynchronous USB storage path sweep")
        scope.launch {
            val scannedFiles = withContext(Dispatchers.IO) {
                val list = mutableListOf<File>()

                // Sweep major storage mount roots
                usbMountRoots.forEach { rootPath ->
                    val rootDir = File(rootPath)
                    if (rootDir.exists() && rootDir.isDirectory) {
                        val subDirs = rootDir.listFiles() ?: return@forEach
                        subDirs.forEach { subDir ->
                            if (subDir.isDirectory && subDir.name != "self" && subDir.name != "emulated") {
                                Log.i(TAG, "Scanning potential USB mount on IO thread: ${subDir.absolutePath}")
                                scanDirectory(subDir, list, 0)
                                withContext(Dispatchers.Main) {
                                    setupDirectoryObserver(subDir)
                                }
                            }
                        }
                    }
                }

                // Check external files directories in the application sandbox
                val externalFilesDirs = context.getExternalFilesDirs(null)
                externalFilesDirs.forEach { dir ->
                    if (dir != null && dir.exists()) {
                        Log.i(TAG, "Scanning app sandbox storage on IO thread: ${dir.absolutePath}")
                        scanDirectory(dir, list, 0)
                        withContext(Dispatchers.Main) {
                            setupDirectoryObserver(dir)
                        }
                    }
                }
                list
            }

            Log.i(TAG, "Finished background scanning. Found ${scannedFiles.size} media files.")
            currentPlaylist.clear()
            currentPlaylist.addAll(scannedFiles)
            onPlaylistUpdated(currentPlaylist)
        }
    }

    /**
     * Traverses the directory recursively with explicit depth boundary controls.
     */
    private fun scanDirectory(dir: File, list: MutableList<File>, currentDepth: Int) {
        // Enforce the depth limit of 3 to prevent performance bottlenecks or stack overflows
        if (currentDepth > 3) {
            return
        }

        val files = dir.listFiles() ?: return
        files.forEach { file ->
            if (file.isDirectory) {
                scanDirectory(file, list, currentDepth + 1)
            } else if (file.isFile) {
                val ext = file.extension.lowercase()
                if (mediaExtensions.contains(ext)) {
                    Log.i(TAG, "Found media file: ${file.absolutePath}")
                    list.add(file)
                }
            }
        }
    }

    /**
     * Dynamic folder listener to auto-add or remove files during USB live sync.
     */
    private fun setupDirectoryObserver(dir: File) {
        // Prevent duplicate observers on the same folder
        if (observers.any { it.toString().contains(dir.absolutePath) }) return

        try {
            // Monitor create and delete actions
            val observer = object : FileObserver(dir.absolutePath, CREATE or DELETE) {
                override fun onEvent(event: Int, path: String?) {
                    if (path != null) {
                        Log.i(TAG, "FileObserver event $event detected for: $path. Triggering rescrape.")
                        // Trigger rescrape asynchronously
                        startScraping()
                    }
                }
            }
            observer.startWatching()
            observers.add(observer)
            Log.d(TAG, "FileObserver started for ${dir.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start FileObserver for ${dir.absolutePath}", e)
        }
    }

    fun getPlaylist(): List<File> = currentPlaylist

    fun stopScraping() {
        observers.forEach { it.stopWatching() }
        observers.clear()
        scope.cancel()
    }
}

package com.se_chukei.fleetcontroller

import android.content.Context
import android.os.FileObserver
import android.util.Log
import java.io.File

class UsbMediaScraper(private val context: Context, private val onPlaylistUpdated: (List<File>) -> Unit) {

    private val TAG = "UsbMediaScraper"

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
     * Scans standard directory roots for USB devices and indexes media.
     */
    fun startScraping() {
        Log.i(TAG, "Triggering automatic USB storage path sweep")
        val scannedFiles = mutableListOf<File>()
        usbMountRoots.forEach { rootPath ->
            val rootDir = File(rootPath)
            if (rootDir.exists() && rootDir.isDirectory) {
                // Look for sub-directories in /storage or /mnt that typically represent mounted volumes
                val subDirs = rootDir.listFiles() ?: return@forEach
                subDirs.forEach { subDir ->
                    // Filter out standard non-removable storage if possible, but scan everything in storage
                    if (subDir.isDirectory && subDir.name != "self" && subDir.name != "emulated") {
                        Log.i(TAG, "Scanning potential USB mount: ${subDir.absolutePath}")
                        scanDirectory(subDir, scannedFiles)
                        setupDirectoryObserver(subDir)
                    }
                }
            }
        }

        // Fallback or development sweep: check if there's external files directory in application sandbox
        val externalFilesDirs = context.getExternalFilesDirs(null)
        externalFilesDirs.forEach { dir ->
            if (dir != null && dir.exists()) {
                Log.i(TAG, "Scanning app sandbox external storage: ${dir.absolutePath}")
                scanDirectory(dir, scannedFiles)
                setupDirectoryObserver(dir)
            }
        }

        currentPlaylist.clear()
        currentPlaylist.addAll(scannedFiles)
        onPlaylistUpdated(currentPlaylist)
    }

    private fun scanDirectory(dir: File, list: MutableList<File>) {
        val files = dir.listFiles() ?: return
        files.forEach { file ->
            if (file.isDirectory) {
                // Restrict recursive depth to 3 to prevent performance bottlenecks on massive filesystems
                scanDirectory(file, list)
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
        try {
            // Monitor create and delete actions
            val observer = object : FileObserver(dir.absolutePath, CREATE or DELETE) {
                override fun onEvent(event: Int, path: String?) {
                    if (path != null) {
                        Log.i(TAG, "FileObserver event $event detected for: $path")
                        // Trigger a rescrape when a change is detected
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
    }
}

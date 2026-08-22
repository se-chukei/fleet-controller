package com.se_chukei.fleetcontroller

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DailyLogManager(private val context: Context) {
    private val maxTotalStorageBytes = 50 * 1024 * 1024L // 50 MB hard cap
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    @Synchronized
    fun log(message: String) {
        if (!isTroubleshootingWorthy(message)) return

        try {
            val logDir = File(context.filesDir, "daily_logs").apply { mkdirs() }
            val todayFileName = "log_${dateFormat.format(Date())}.txt"
            val dailyFile = File(logDir, todayFileName)

            dailyFile.appendText("[${System.currentTimeMillis()}] $message\n")
            enforceStorageCap(logDir)
        } catch (e: Exception) {
            // Fail silently
        }
    }

    private fun isTroubleshootingWorthy(log: String): Boolean {
        return log.contains("ERROR", ignoreCase = true) ||
               log.contains("WARN", ignoreCase = true) ||
               log.contains("State change", ignoreCase = true) ||
               log.contains("Stall detected", ignoreCase = true) ||
               log.contains("Sync error", ignoreCase = true) ||
               log.contains("Exception", ignoreCase = true) ||
               log.contains("Failure", ignoreCase = true)
    }

    private fun enforceStorageCap(logDir: File) {
        val files = logDir.listFiles()?.sortedBy { it.lastModified() } ?: return
        var totalSize = files.sumOf { it.length() }

        for (file in files) {
            if (totalSize <= maxTotalStorageBytes) break
            totalSize -= file.length()
            file.delete()
        }
    }
}
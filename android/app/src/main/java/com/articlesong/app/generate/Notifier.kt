package com.articlesong.app.generate

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ForegroundInfo
import com.articlesong.app.MainActivity
import com.articlesong.app.R
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus

/** Generation progress, "ready", and failure notifications. */
class Notifier(private val context: Context) {
    private val manager = NotificationManagerCompat.from(context)

    fun createChannels() {
        val system = context.getSystemService(NotificationManager::class.java)
        system.createNotificationChannel(
            NotificationChannel(CHANNEL_PROGRESS, "Composing", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Progress while a song is being made"
                setShowBadge(false)
            },
        )
        system.createNotificationChannel(
            NotificationChannel(CHANNEL_READY, "Songs ready", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When a song is ready to play, or couldn't be made"
            },
        )
    }

    fun progressForegroundInfo(song: SongEntity) = ForegroundInfo(
        progressId(song.id),
        progressNotification(song),
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )

    fun updateProgress(song: SongEntity) = notify(progressId(song.id)) { progressNotification(song) }

    fun ready(song: SongEntity) = notify(resultId(song.id)) {
        NotificationCompat.Builder(context, CHANNEL_READY)
            .setSmallIcon(R.drawable.ic_stat_note)
            .setContentTitle("Your song is ready")
            .setContentText(song.displayTitle)
            .setLargeIcon(song.imagePath?.let { BitmapFactory.decodeFile(it) })
            .setContentIntent(openIntent(song.id, play = true))
            .addAction(0, "Play", openIntent(song.id, play = true))
            .setAutoCancel(true)
            .build()
    }

    /** Auto-play was blocked by Android's background limits; one tap starts it. */
    fun readyToPlay(song: SongEntity) = notify(resultId(song.id)) {
        NotificationCompat.Builder(context, CHANNEL_READY)
            .setSmallIcon(R.drawable.ic_stat_note)
            .setContentTitle("Tap to play your new song")
            .setContentText(song.displayTitle)
            .setContentIntent(openIntent(song.id, play = true))
            .setAutoCancel(true)
            .build()
    }

    fun failed(song: SongEntity) = notify(resultId(song.id)) {
        NotificationCompat.Builder(context, CHANNEL_READY)
            .setSmallIcon(R.drawable.ic_stat_note)
            .setContentTitle("Couldn't make your song")
            .setContentText(song.error ?: song.displayTitle)
            .setStyle(NotificationCompat.BigTextStyle().bigText("${song.displayTitle}\n${song.error.orEmpty()}"))
            .setContentIntent(openIntent(song.id, play = false))
            .addAction(0, "Retry", actionIntent(SongActionReceiver.ACTION_RETRY, song.id))
            .setAutoCancel(true)
            .build()
    }

    fun exportFailed(song: SongEntity, error: Exception) = notify(resultId(song.id) + 1) {
        NotificationCompat.Builder(context, CHANNEL_READY)
            .setSmallIcon(R.drawable.ic_stat_note)
            .setContentTitle("Couldn't copy to your Music folder")
            .setContentText("${song.displayTitle} is still in ArticleSong. (${error.message})")
            .setContentIntent(openIntent(song.id, play = false))
            .setAutoCancel(true)
            .build()
    }

    fun clearResult(songId: String) = manager.cancel(resultId(songId))

    fun cancelProgress(songId: String) = manager.cancel(progressId(songId))

    private fun progressNotification(song: SongEntity) =
        NotificationCompat.Builder(context, CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_note)
            .setContentTitle(song.displayTitle)
            .setContentText(stageText(song.status))
            .setSubText(song.styleName)
            .setProgress(STAGES, song.status.stage + 1, song.status == SongStatus.QUEUED)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openIntent(song.id, play = false))
            .addAction(0, "Cancel", actionIntent(SongActionReceiver.ACTION_CANCEL, song.id))
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()

    private fun openIntent(songId: String, play: Boolean): PendingIntent = PendingIntent.getActivity(
        context,
        (songId + play).hashCode(),
        Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(if (play) MainActivity.EXTRA_PLAY_SONG_ID else MainActivity.EXTRA_SONG_ID, songId),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun actionIntent(action: String, songId: String): PendingIntent = PendingIntent.getBroadcast(
        context,
        (action + songId).hashCode(),
        Intent(context, SongActionReceiver::class.java).setAction(action).putExtra(SongWorker.KEY_SONG_ID, songId),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private inline fun notify(id: Int, build: () -> android.app.Notification) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) manager.notify(id, build())
    }

    companion object {
        const val CHANNEL_PROGRESS = "progress"
        const val CHANNEL_READY = "ready"
        private const val STAGES = 4

        fun stageText(status: SongStatus): String = when (status) {
            SongStatus.QUEUED -> "Waiting to start…"
            SongStatus.READING -> "Reading the article…"
            SongStatus.WRITING_LYRICS -> "Writing lyrics…"
            SongStatus.COMPOSING -> "Composing music…"
            SongStatus.STREAMING -> "Playable now"
            SongStatus.DOWNLOADING -> "Saving to your library…"
            SongStatus.READY -> "Ready"
            SongStatus.FAILED -> "Failed"
            SongStatus.CANCELLED -> "Cancelled"
        }

        private fun progressId(songId: String) = 10_000 + (songId.hashCode() and 0xFFFFF)
        private fun resultId(songId: String) = 50_000_000 + (songId.hashCode() and 0xFFFFF) * 2
    }
}

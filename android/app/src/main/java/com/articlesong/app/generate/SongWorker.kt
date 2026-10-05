package com.articlesong.app.generate

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.articlesong.app.AppGraph
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

/** Runs one song's [SongPipeline] as a foreground job, keeping its progress notification current. */
class SongWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val graph by lazy { AppGraph.get(applicationContext) }

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_SONG_ID) ?: return Result.failure()
        val song = graph.songs.get(id) ?: return Result.success()
        if (!song.status.isActive) return Result.success()
        try {
            setForeground(graph.notifier.progressForegroundInfo(song))
        } catch (e: IllegalStateException) {
            // Started from the background (e.g. a retry after reboot): run as a regular job instead.
            Log.w(TAG, "Couldn't promote song $id to a foreground job", e)
        }
        try {
            coroutineScope {
                val progress = launch {
                    graph.songs.observe(id).filterNotNull().distinctUntilChangedBy { it.status }.collect {
                        if (it.status.isActive) graph.notifier.updateProgress(it)
                    }
                }
                graph.pipeline.run(id)
                progress.cancel()
            }
        } finally {
            // WorkManager removes its own foreground notification, but not one we posted when
            // the job couldn't run in the foreground.
            graph.notifier.cancelProgress(id)
        }
        return Result.success()
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val id = inputData.getString(KEY_SONG_ID).orEmpty()
        return graph.notifier.progressForegroundInfo(graph.songs.get(id) ?: error("Song $id missing"))
    }

    companion object {
        const val KEY_SONG_ID = "song_id"
        private const val TAG = "SongWorker"
    }
}

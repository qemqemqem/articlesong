package com.articlesong.app.generate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.articlesong.app.AppGraph
import com.articlesong.app.data.SongMissingException
import kotlinx.coroutines.launch

/** Notification actions: Cancel (progress) and Retry (failure). */
class SongActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(SongWorker.KEY_SONG_ID) ?: return
        val graph = AppGraph.get(context)
        val pending = goAsync()
        graph.scope.launch {
            try {
                when (intent.action) {
                    ACTION_CANCEL -> graph.scheduler.cancel(id)
                    ACTION_RETRY -> {
                        graph.notifier.clearResult(id)
                        graph.scheduler.retry(id)
                    }
                }
            } catch (_: SongMissingException) {
                // The song was deleted after the notification was posted; nothing to do.
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_CANCEL = "com.articlesong.app.CANCEL_SONG"
        const val ACTION_RETRY = "com.articlesong.app.RETRY_SONG"
    }
}

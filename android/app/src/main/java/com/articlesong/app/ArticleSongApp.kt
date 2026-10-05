package com.articlesong.app

import android.app.Application
import android.util.Log
import androidx.work.Configuration
import kotlinx.coroutines.launch

class ArticleSongApp : Application(), Configuration.Provider {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        DebugHooks.install(graph, this)
        graph.notifier.createChannels()
        // Safety net: anything still mid-generation gets its job back (KEEP never duplicates a live one).
        graph.scope.launch { graph.songs.active().forEach { graph.scheduler.enqueue(it.id) } }
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) Log.DEBUG else Log.ERROR)
            .build()
}

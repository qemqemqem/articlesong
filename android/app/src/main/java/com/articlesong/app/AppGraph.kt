package com.articlesong.app

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.articlesong.app.api.ClaudeClient
import com.articlesong.app.api.ModelCache
import com.articlesong.app.api.SunoClient
import com.articlesong.app.api.defaultHttpClient
import com.articlesong.app.data.AppSettings
import com.articlesong.app.data.CachedModel
import com.articlesong.app.data.SettingsStore
import com.articlesong.app.data.SongDatabase
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongFiles
import com.articlesong.app.data.SongRepository
import com.articlesong.app.extract.ArticleExtractor
import com.articlesong.app.extract.WebViewArticleExtractor
import com.articlesong.app.generate.Notifier
import com.articlesong.app.generate.PipelineListener
import com.articlesong.app.generate.PipelineTiming
import com.articlesong.app.generate.SongPipeline
import com.articlesong.app.generate.SongScheduler
import com.articlesong.app.playback.PlayerController
import com.articlesong.app.recipe.SongRecipe
import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrl

/** Where the app talks to. Instrumented tests point these at a local mock server. */
data class ApiEndpoints(
    val suno: String = SunoClient.DEFAULT_BASE_URL,
    /** null = the Anthropic SDK's default. */
    val anthropic: String? = null,
)

/** Hand-wired dependencies, one per process. */
class AppGraph(private val app: Context) {
    /** Background work outside the UI (notification actions, auto-play). Failures are logged, not fatal. */
    val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, e -> Log.e("AppGraph", "Background task failed", e) },
    )
    @Volatile var endpoints = ApiEndpoints()
    /** Read once, when the pipeline is first built (tests shorten Suno's poll interval). */
    @Volatile var pipelineTiming = PipelineTiming()

    val recipe: SongRecipe by lazy { SongRecipe.fromAssets(app) }
    val songs: SongRepository by lazy { SongRepository(SongDatabase.build(app)) }
    val settings: SettingsStore by lazy {
        SettingsStore(PreferenceDataStoreFactory.create { app.preferencesDataStoreFile("settings") }, recipe)
    }
    val http by lazy { defaultHttpClient() }
    val suno by lazy { SunoClient(http, { endpoints.suno.toHttpUrl() }, { settings.current().sunoApiKey }) }
    val extractor: ArticleExtractor by lazy { WebViewArticleExtractor(app, http) }
    val files by lazy { SongFiles(app, http) }
    val notifier by lazy { Notifier(app) }
    val player by lazy { PlayerController(app, MainScope()) }
    val scheduler by lazy { SongScheduler(app, songs, files) }

    private val modelCache = object : ModelCache {
        override suspend fun get() = settings.cachedClaudeModel()
        override suspend fun put(model: CachedModel) = settings.cacheClaudeModel(model)
    }

    private var claudeClient: Pair<List<String?>, ClaudeClient>? = null

    /**
     * Claude for lyrics when an Anthropic key is configured, else null (Suno writes them).
     * One SDK client (with its connection pool) is reused until the key, model or endpoint changes.
     * A replaced client is not closed: a song in progress may still be using it, and its idle
     * threads exit on their own.
     */
    @Synchronized
    fun claude(config: AppSettings): ClaudeClient? {
        val key = config.anthropicApiKey.takeIf { it.isNotBlank() } ?: return null
        val identity = listOf(key, config.claudeModelOverride, endpoints.anthropic)
        claudeClient?.let { (id, client) -> if (id == identity) return client }
        return ClaudeClient(key, config.claudeModelOverride, modelCache, endpoints.anthropic)
            .also { claudeClient = identity to it }
    }

    /** Delete a song everywhere: player queue, notifications, background job, database, files. */
    suspend fun deleteSong(id: String) {
        player.remove(id)
        notifier.clearResult(id)
        notifier.cancelProgress(id)
        scheduler.delete(id)
    }

    val pipeline: SongPipeline by lazy {
        SongPipeline(
            store = songs,
            extractor = extractor,
            suno = suno,
            downloads = files,
            recipe = recipe,
            settings = settings::current,
            lyricsWriter = ::claude,
            listener = object : PipelineListener {
                override fun onPlayable(song: SongEntity) {
                    scope.launch { if (settings.current().autoPlay) player.playOrQueueNext(song.id) }
                }

                override fun onReady(song: SongEntity) {
                    val playback = player.state.value
                    if (!(playback.isPlaying && playback.currentSongId == song.id)) notifier.ready(song)
                }

                override fun onFailed(song: SongEntity) = notifier.failed(song)

                override fun onExportFailed(song: SongEntity, error: Exception) = notifier.exportFailed(song, error)
            },
            timing = pipelineTiming,
        )
    }

    companion object {
        fun get(context: Context): AppGraph = (context.applicationContext as ArticleSongApp).graph
    }
}

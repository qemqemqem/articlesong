package com.articlesong.app.ui

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.articlesong.app.AppGraph
import com.articlesong.app.data.AppSettings
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.data.SongSummary
import com.articlesong.app.recipe.SongStyle
import com.articlesong.app.share.SongSource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class LibraryUiState(
    val loaded: Boolean = false,
    /** Songs being made right now (newest first). */
    val composing: List<SongSummary> = emptyList(),
    /** Finished, failed and cancelled songs after search/favorites filtering. */
    val library: List<SongSummary> = emptyList(),
    val totalSongs: Int = 0,
    val totalSeconds: Double = 0.0,
    val query: String = "",
    val favoritesOnly: Boolean = false,
    val isConfigured: Boolean = true,
) {
    /** What "play all" / tapping a row queues up: playable library songs in display order. */
    val playQueue: List<String> get() = library.filter { it.status.isPlayable }.map { it.id }
}

class AppViewModel(private val graph: AppGraph) : ViewModel() {
    val player = graph.player

    private val query = MutableStateFlow("")
    private val favoritesOnly = MutableStateFlow(false)
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages

    val settings: StateFlow<AppSettings?> =
        graph.settings.settings.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val library: StateFlow<LibraryUiState> = combine(
        graph.songs.summaries, graph.settings.settings, query, favoritesOnly,
    ) { songs, config, q, favorites ->
        val finished = songs.filter { !it.status.isActive }
        val needle = q.trim()
        LibraryUiState(
            loaded = true,
            composing = songs.filter { it.status.isActive },
            library = finished.filter { song ->
                (!favorites || song.favorite) && (needle.isEmpty() || listOfNotNull(
                    song.displayTitle, song.sourceTitle, song.sourceSite, song.styleName,
                ).any { it.contains(needle, ignoreCase = true) })
            },
            totalSongs = finished.count { it.status == SongStatus.READY },
            totalSeconds = finished.sumOf { it.durationSec ?: 0.0 },
            query = q,
            favoritesOnly = favorites,
            isConfigured = config.isConfigured,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, LibraryUiState())

    init {
        player.connect()
    }

    fun observeSong(id: String): Flow<SongEntity?> = graph.songs.observe(id)

    fun setQuery(value: String) {
        query.value = value
    }

    fun toggleFavoritesOnly() {
        favoritesOnly.value = !favoritesOnly.value
    }

    fun play(songId: String) {
        val queue = library.value.playQueue
        player.play(if (songId in queue) queue else listOf(songId), songId)
    }

    fun toggleFavorite(id: String) = launch { graph.songs.toggleFavorite(id) }
    fun cancel(id: String) = launch { graph.scheduler.cancel(id) }
    fun retry(id: String) = launch {
        graph.notifier.clearResult(id)
        graph.scheduler.retry(id)
    }

    fun delete(id: String) = launch { graph.deleteSong(id) }

    fun createSong(source: SongSource, style: SongStyle) = launch {
        graph.settings.setLastStyle(style.id)
        graph.scheduler.create(source, style)
    }

    fun regenerate(id: String, style: SongStyle) = launch {
        val original = graph.songs.get(id) ?: return@launch
        graph.settings.setLastStyle(style.id)
        graph.scheduler.regenerate(original, style)
        _messages.tryEmit("Composing a ${style.name} version…")
    }

    fun saveToMusic(id: String) = launch {
        val song = graph.songs.get(id) ?: return@launch
        val uri = graph.files.exportAudio(song)
        graph.songs.update(id) { it.copy(exportedUri = uri.toString()) }
        _messages.tryEmit("Saved to Music/ArticleSong")
    }

    suspend fun shareIntent(id: String): Intent? {
        val song = graph.songs.get(id) ?: return null
        val uri = runCatching { graph.files.shareUri(song) }.getOrElse {
            _messages.tryEmit("This song hasn't finished downloading yet")
            return null
        }
        return Intent(Intent.ACTION_SEND)
            .setType("audio/mpeg")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TITLE, song.displayTitle)
            .apply { song.sourceUrl?.let { putExtra(Intent.EXTRA_TEXT, "${song.displayTitle} — a song about $it") } }
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    // ---- Settings ----

    fun setSunoKey(key: String) = launch { graph.settings.setSunoApiKey(key) }
    fun setAnthropicKey(key: String) = launch { graph.settings.setAnthropicApiKey(key) }
    fun setSunoModel(model: String) = launch { graph.settings.setSunoModel(model) }
    fun setClaudeModel(model: String) = launch { graph.settings.setClaudeModelOverride(model) }
    fun setAutoPlay(enabled: Boolean) = launch { graph.settings.setAutoPlay(enabled) }
    fun setSaveToMusic(enabled: Boolean) = launch { graph.settings.setSaveToMusic(enabled) }
    fun updateStyle(index: Int, name: String, description: String) = launch { graph.settings.updateStyle(index, name, description) }
    fun resetStyles() = launch { graph.settings.resetStyles() }

    /** "1,234 credits" or the error message. */
    suspend fun testSuno(): Result<String> = runCatching { "%,d credits left".format(graph.suno.credits()) }

    /** The Claude model lyrics will use, or the error message. */
    suspend fun testClaude(): Result<String> = runCatching {
        val client = graph.claude(graph.settings.current()) ?: error("Add an Anthropic API key first")
        "Using ${client.resolveModel(forceRefresh = true)}"
    }

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _messages.tryEmit(e.message ?: "Something went wrong")
            }
        }
    }
}

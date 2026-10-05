package com.articlesong.app.playback

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PlaybackState(
    val currentSongId: String? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val durationMs: Long = 0,
    val shuffle: Boolean = false,
    val repeatMode: Int = Player.REPEAT_MODE_OFF,
    val hasNext: Boolean = false,
    val hasPrevious: Boolean = false,
    val queueIds: List<String> = emptyList(),
    val error: String? = null,
    /** Bumped on every seek / jump, so position pollers refresh even while paused. */
    val positionVersion: Int = 0,
)

/**
 * App-side handle on [PlaybackService]. Connects lazily, mirrors the player into [state],
 * and offers the handful of commands the UI and auto-play need. Main thread only.
 */
class PlayerController(private val context: Context, private val scope: CoroutineScope) {
    private val _state = MutableStateFlow(PlaybackState())
    val state: StateFlow<PlaybackState> = _state.asStateFlow()

    private var connection: Deferred<MediaController>? = null
    private var connected: MediaController? = null

    private suspend fun controller(): MediaController = withContext(Dispatchers.Main) {
        val pending = connection ?: scope.async(Dispatchers.Main) {
            val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
            MediaController.Builder(context, token).buildAsync().await().also { controller ->
                controller.addListener(object : Player.Listener {
                    override fun onEvents(player: Player, events: Player.Events) = publish(player)
                    override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
                        _state.update { it.copy(positionVersion = it.positionVersion + 1) }
                    }
                    override fun onPlayerError(error: PlaybackException) {
                        _state.update { it.copy(error = "Playback failed: ${error.errorCodeName}") }
                    }
                })
                publish(controller)
                connected = controller
            }
        }.also { connection = it }
        pending.await()
    }

    fun connect() {
        scope.launch { controller() }
    }

    /** Current position, read straight from the player (cheap; poll it from the UI while playing). */
    fun positionMs(): Long = connected?.currentPosition ?: 0

    /** Play [queue] (song ids, in order) starting at [startId]. */
    fun play(queue: List<String>, startId: String) = command {
        val start = queue.indexOf(startId).coerceAtLeast(0)
        setMediaItems(queue.map(::item), start, 0)
        prepare()
        play()
    }

    /** Auto-play a freshly generated song: now if idle, otherwise right after the current one. */
    fun playOrQueueNext(songId: String) = command {
        // "Busy" includes buffering and a brief audio-focus loss, not just audible playback.
        val busy = currentMediaItem != null && playWhenReady && playbackState != Player.STATE_IDLE && playbackState != Player.STATE_ENDED
        if (busy) {
            if (currentMediaItem?.mediaId != songId) addMediaItem(currentMediaItemIndex + 1, item(songId))
        } else {
            setMediaItem(item(songId))
            prepare()
            play()
        }
    }

    fun togglePlayPause() = command { if (isPlaying) pause() else { if (playbackState == Player.STATE_ENDED) seekTo(0); play() } }
    fun seekTo(positionMs: Long) = command { seekTo(positionMs) }
    fun next() = command { seekToNext() }
    fun previous() = command { seekToPrevious() }
    fun toggleShuffle() = command { shuffleModeEnabled = !shuffleModeEnabled }
    fun cycleRepeat() = command {
        repeatMode = when (repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    /** Stop and empty the queue. */
    fun clear() = command {
        stop()
        clearMediaItems()
    }

    /** Drop a deleted song from the queue. */
    fun remove(songId: String) = command {
        (mediaItemCount - 1 downTo 0).filter { getMediaItemAt(it).mediaId == songId }.forEach(::removeMediaItem)
    }

    fun clearError() = _state.update { it.copy(error = null) }

    private fun command(block: MediaController.() -> Unit) {
        scope.launch(Dispatchers.Main) {
            _state.update { it.copy(error = null) }
            controller().block()
        }
    }

    private fun item(id: String) = MediaItem.Builder().setMediaId(id).build()

    private fun publish(player: Player) {
        _state.update {
            PlaybackState(
                currentSongId = player.currentMediaItem?.mediaId,
                isPlaying = player.isPlaying,
                isBuffering = player.playbackState == Player.STATE_BUFFERING,
                durationMs = player.duration.takeIf { d -> d > 0 } ?: 0,
                shuffle = player.shuffleModeEnabled,
                repeatMode = player.repeatMode,
                hasNext = player.hasNextMediaItem(),
                hasPrevious = player.hasPreviousMediaItem() || player.currentPosition > 3_000,
                queueIds = (0 until player.mediaItemCount).map { i -> player.getMediaItemAt(i).mediaId },
                error = it.error,
                positionVersion = it.positionVersion,
            )
        }
    }
}

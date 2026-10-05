package com.articlesong.app.playback

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.articlesong.app.AppGraph
import com.articlesong.app.MainActivity
import com.articlesong.app.R
import com.articlesong.app.data.SongEntity
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.launch

/**
 * Hosts the ExoPlayer + MediaSession: lock screen / notification controls, headset buttons,
 * audio focus. Controllers send bare media ids; [onAddMediaItems] resolves them from the
 * library so there's one place that decides what URI a song plays from.
 */
class PlaybackService : MediaSessionService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var session: MediaSession? = null
    private val graph by lazy { AppGraph.get(this) }

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        player.addListener(object : Player.Listener {
            // A "play" is a song that actually starts sounding: not a queued item skipped while paused.
            private var counted: String? = null

            private fun countIfPlaying(player: Player) {
                val id = player.currentMediaItem?.mediaId ?: return
                if (player.isPlaying && id != counted) {
                    counted = id
                    scope.launch { graph.songs.recordPlay(id) }
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                counted = null
                countIfPlaying(player)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) = countIfPlaying(player)
        })
        session = MediaSession.Builder(this, player)
            .setSessionActivity(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_PLAYER, true),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            )
            .setCallback(SessionCallback())
            .build()
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this).build().apply { setSmallIcon(R.drawable.ic_stat_note) },
        )
        // Android may refuse to start a foreground service while we're in the background
        // (e.g. auto-play after a song finishes generating). Ask the user to tap instead.
        setListener(object : Listener {
            override fun onForegroundServiceStartNotAllowedException() {
                session?.player?.let { player ->
                    player.pause()
                    player.currentMediaItem?.mediaId?.let { id -> scope.launch { graph.songs.get(id)?.let(graph.notifier::readyToPlay) } }
                }
            }
        })
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    private inner class SessionCallback : MediaSession.Callback {
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> = scope.future {
            mediaItems.mapNotNull { item -> graph.songs.get(item.mediaId)?.let(::mediaItemFor) }.toMutableList()
        }
    }

    companion object {
        fun mediaItemFor(song: SongEntity): MediaItem? {
            val uri = song.playUri ?: return null
            return MediaItem.Builder()
                .setMediaId(song.id)
                .setUri(uri)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(song.displayTitle)
                        .setArtist(song.sourceSite ?: "ArticleSong")
                        .setAlbumTitle(song.styleName)
                        .setArtworkUri(song.artworkUri?.let(Uri::parse))
                        .setIsPlayable(true)
                        .setIsBrowsable(false)
                        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                        .build(),
                )
                .build()
        }
    }
}

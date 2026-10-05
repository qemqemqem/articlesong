package com.articlesong.app.ui.player

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Lyrics
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.playback.PlaybackState
import com.articlesong.app.playback.PlayerController
import com.articlesong.app.ui.components.Artwork
import com.articlesong.app.ui.components.EqualizerBars
import com.articlesong.app.ui.components.formatMs
import com.articlesong.app.ui.components.rememberArtworkColor
import com.articlesong.app.ui.theme.Palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** Polls the player's position while it plays (the player doesn't push position updates). */
@Composable
fun rememberPositionMs(player: PlayerController, state: PlaybackState): Long {
    var position by remember { mutableLongStateOf(0L) }
    LaunchedEffect(state.currentSongId, state.isPlaying, state.positionVersion) {
        position = player.positionMs()
        while (state.isPlaying) {
            delay(250)
            position = player.positionMs()
        }
    }
    return position
}

class PlayerActions(
    val toggle: () -> Unit,
    val seek: (Long) -> Unit,
    val next: () -> Unit,
    val previous: () -> Unit,
    val shuffle: () -> Unit,
    val repeat: () -> Unit,
    val favorite: (String) -> Unit,
    val openArticle: (String) -> Unit,
    val share: (String) -> Unit,
    val saveToMusic: (String) -> Unit,
    val regenerate: (String) -> Unit,
    val delete: (String) -> Unit,
)

@Composable
fun MiniPlayer(
    state: PlaybackState,
    song: SongEntity?,
    positionMs: Long,
    onExpand: () -> Unit,
    actions: PlayerActions,
    modifier: Modifier = Modifier,
) {
    if (song == null) return
    val progress = if (state.durationMs > 0) positionMs.toFloat() / state.durationMs else 0f
    Column(
        modifier
            .fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(20.dp))
            .clip(RoundedCornerShape(20.dp))
            .background(Palette.CardHigh)
            .clickable(onClick = onExpand)
            .testTag("miniPlayer"),
    ) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Artwork(song.artworkUri, song.id, Modifier.size(46.dp), corner = 12.dp)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(song.displayTitle, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(song.styleName, song.sourceSite).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = Palette.TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            PlayPauseButton(state, onClick = actions.toggle, size = 44, tint = Palette.Text, background = Color.Transparent, tag = "playPause")
            IconButton(onClick = actions.next, enabled = state.hasNext) {
                Icon(Icons.Rounded.SkipNext, "Next", tint = if (state.hasNext) Palette.Text else Palette.TextTertiary)
            }
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(Palette.Outline)) {
            Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(2.dp).background(Palette.Accent))
        }
    }
}

@Composable
private fun PlayPauseButton(state: PlaybackState, onClick: () -> Unit, size: Int, tint: Color, background: Color, tag: String) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(background).clickable(onClick = onClick).testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        if (state.isBuffering && !state.isPlaying) {
            CircularProgressIndicator(Modifier.size((size * 0.45).dp), color = tint, strokeWidth = 2.5.dp)
        } else {
            Icon(
                if (state.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                contentDescription = if (state.isPlaying) "Pause" else "Play",
                tint = tint,
                modifier = Modifier.size((size * 0.55).dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingScreen(
    state: PlaybackState,
    song: SongEntity?,
    positionMs: Long,
    onCollapse: () -> Unit,
    actions: PlayerActions,
) {
    if (song == null) return
    val tint = rememberArtworkColor(song.artworkUri, song.id)
    var showLyrics by rememberSaveable(song.id) { mutableStateOf(false) }
    val dragOffset = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()

    Box(
        Modifier
            .fillMaxSize()
            .offset { IntOffset(0, dragOffset.value.roundToInt()) }
            .background(Palette.Background)
            .background(Brush.verticalGradient(listOf(tint.copy(alpha = 0.55f), tint.copy(alpha = 0.12f), Palette.Background)))
            .testTag("nowPlaying"),
    ) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp),
        ) {
            // Header doubles as the swipe-down handle.
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .pointerInput(Unit) {
                        detectVerticalDragGestures(
                            onDragEnd = {
                                scope.launch {
                                    if (dragOffset.value > 220f) onCollapse()
                                    dragOffset.animateTo(0f, spring())
                                }
                            },
                        ) { _, delta -> scope.launch { dragOffset.snapTo((dragOffset.value + delta).coerceAtLeast(0f)) } }
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onCollapse) { Icon(Icons.Rounded.KeyboardArrowDown, "Close player", Modifier.size(32.dp)) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("NOW PLAYING", style = MaterialTheme.typography.labelSmall, color = Palette.TextSecondary)
                    Text(
                        song.styleName,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                    )
                }
                SongMenu(song, actions)
            }

            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().padding(vertical = 20.dp), contentAlignment = Alignment.Center) {
                val artSize = minOf(maxWidth, maxHeight)
                AnimatedContent(showLyrics && song.lyrics != null, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "art") { lyrics ->
                    if (lyrics) {
                        LyricsText(
                            song.lyrics.orEmpty(),
                            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp).testTag("lyrics"),
                        )
                    } else {
                        val scale by animateFloatAsState(if (state.isPlaying) 1f else 0.88f, spring(dampingRatio = 0.6f), label = "artScale")
                        Artwork(
                            song.artworkUri, song.id,
                            Modifier.width(artSize).aspectRatio(1f).scale(scale).shadow(28.dp, RoundedCornerShape(24.dp)),
                            corner = 24.dp,
                        )
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        song.displayTitle,
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 1,
                        modifier = Modifier.basicMarquee(),
                    )
                    Text(
                        song.sourceSite ?: song.sourceTitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = { actions.favorite(song.id) }) {
                    Icon(
                        if (song.favorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = if (song.favorite) "Unfavorite" else "Favorite",
                        tint = if (song.favorite) Palette.Magenta else Palette.TextSecondary,
                    )
                }
            }

            if (song.status == SongStatus.STREAMING || song.status == SongStatus.DOWNLOADING) {
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    EqualizerBars(true, Modifier.size(12.dp), color = Palette.Cyan, bars = 3)
                    Text(
                        if (song.status == SongStatus.STREAMING) "Live from the studio · full quality on its way" else "Saving to your library…",
                        style = MaterialTheme.typography.labelMedium,
                        color = Palette.Cyan,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }

            SeekBar(state, positionMs, actions.seek)

            Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ToggleIcon(Icons.Rounded.Shuffle, "Shuffle", state.shuffle, actions.shuffle)
                IconButton(onClick = actions.previous, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Rounded.SkipPrevious, "Previous", Modifier.size(36.dp))
                }
                PlayPauseButton(state, actions.toggle, size = 76, tint = Palette.Background, background = Color.White, tag = "nowPlayingPlayPause")
                IconButton(onClick = actions.next, enabled = state.hasNext, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Rounded.SkipNext, "Next", Modifier.size(36.dp), tint = if (state.hasNext) Palette.Text else Palette.TextTertiary)
                }
                ToggleIcon(
                    if (state.repeatMode == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                    "Repeat",
                    state.repeatMode != Player.REPEAT_MODE_OFF,
                    actions.repeat,
                )
            }

            Row(
                Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Pill(Icons.Rounded.Lyrics, if (showLyrics) "Artwork" else "Lyrics", enabled = song.lyrics != null) { showLyrics = !showLyrics }
                song.sourceUrl?.let { url ->
                    Pill(Icons.AutoMirrored.Rounded.OpenInNew, "Read article") { actions.openArticle(url) }
                }
            }
        }
    }
}

/** Thin, Spotify-style scrubber: tap or drag anywhere on it; the thumb grows while dragging. */
@Composable
private fun SeekBar(state: PlaybackState, positionMs: Long, onSeek: (Long) -> Unit) {
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }
    val duration = state.durationMs.coerceAtLeast(1)
    val enabled = state.durationMs > 0
    val value = if (dragging) dragValue else (positionMs.toFloat() / duration).coerceIn(0f, 1f)
    val thumb by animateDpAsState(if (dragging) 18.dp else 12.dp, label = "thumb")
    Column(Modifier.padding(top = 16.dp)) {
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(28.dp)
                .testTag("seekBar")
                .semantics {
                    progressBarRangeInfo = ProgressBarRangeInfo(value, 0f..1f)
                    if (enabled) setProgress { onSeek((it * duration).toLong()); true }
                }
                .pointerInput(enabled, duration) {
                    if (!enabled) return@pointerInput
                    detectTapGestures { offset -> onSeek((offset.x / size.width * duration).toLong()) }
                }
                .pointerInput(enabled, duration) {
                    if (!enabled) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragStart = { offset -> dragging = true; dragValue = (offset.x / size.width).coerceIn(0f, 1f) },
                        onDragEnd = { onSeek((dragValue * duration).toLong()); dragging = false },
                        onDragCancel = { dragging = false },
                    ) { change, _ -> dragValue = (change.position.x / size.width).coerceIn(0f, 1f) }
                },
            contentAlignment = Alignment.CenterStart,
        ) {
            val width = maxWidth
            Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)))
            Box(Modifier.fillMaxWidth(value).height(4.dp).clip(CircleShape).background(Color.White))
            if (enabled) {
                Box(
                    Modifier
                        .offset(x = (width - thumb) * value)
                        .size(thumb)
                        .shadow(4.dp, CircleShape)
                        .background(Color.White, CircleShape),
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Text(formatMs(if (dragging) (dragValue * duration).toLong() else positionMs), style = MaterialTheme.typography.labelMedium, color = Palette.TextSecondary)
            Spacer(Modifier.weight(1f))
            Text(if (state.durationMs > 0) formatMs(state.durationMs) else "--:--", style = MaterialTheme.typography.labelMedium, color = Palette.TextSecondary)
        }
    }
}

@Composable
private fun ToggleIcon(icon: ImageVector, label: String, on: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Box(contentAlignment = Alignment.BottomCenter) {
            Icon(icon, label, tint = if (on) Palette.Violet else Palette.TextSecondary)
            if (on) Box(Modifier.offset(y = 8.dp).size(4.dp).clip(CircleShape).background(Palette.Violet))
        }
    }
}

@Composable
private fun Pill(icon: ImageVector, text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(Color.White.copy(alpha = if (enabled) 0.1f else 0.04f))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp)
            .widthIn(min = 64.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(18.dp), tint = if (enabled) Palette.Text else Palette.TextTertiary)
        Text(text, style = MaterialTheme.typography.labelLarge, color = if (enabled) Palette.Text else Palette.TextTertiary, modifier = Modifier.padding(start = 6.dp))
    }
}

@Composable
fun SongMenu(song: SongEntity, actions: PlayerActions) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Rounded.MoreVert, "More options") }
        DropdownMenu(open, onDismissRequest = { open = false }) {
            song.sourceUrl?.let { url ->
                DropdownMenuItem(text = { Text("Read the article") }, onClick = { open = false; actions.openArticle(url) })
            }
            if (song.audioPath != null) {
                DropdownMenuItem(text = { Text("Share song") }, onClick = { open = false; actions.share(song.id) })
                if (song.exportedUri == null) {
                    DropdownMenuItem(text = { Text("Save to Music folder") }, onClick = { open = false; actions.saveToMusic(song.id) })
                }
            }
            if (song.articleText != null) {
                DropdownMenuItem(text = { Text("New version in another style") }, onClick = { open = false; actions.regenerate(song.id) })
            }
            DropdownMenuItem(text = { Text("Delete", color = Palette.Error) }, onClick = { open = false; actions.delete(song.id) })
        }
    }
}

package com.articlesong.app.ui.library

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.data.SongSummary
import com.articlesong.app.generate.Notifier
import com.articlesong.app.playback.PlaybackState
import com.articlesong.app.ui.LibraryUiState
import com.articlesong.app.ui.components.Artwork
import com.articlesong.app.ui.components.EqualizerBars
import com.articlesong.app.ui.components.GradientButton
import com.articlesong.app.ui.components.SectionLabel
import com.articlesong.app.ui.components.StageStepper
import com.articlesong.app.ui.components.formatDuration
import com.articlesong.app.ui.components.relativeTime
import com.articlesong.app.ui.player.LyricsText
import com.articlesong.app.ui.theme.Palette
import kotlinx.coroutines.flow.Flow

class LibraryActions(
    val play: (String) -> Unit,
    val toggleFavorite: (String) -> Unit,
    val cancel: (String) -> Unit,
    val retry: (String) -> Unit,
    val delete: (String) -> Unit,
    val share: (String) -> Unit,
    val openArticle: (String) -> Unit,
    val regenerate: (String) -> Unit,
    val setQuery: (String) -> Unit,
    val toggleFavoritesOnly: () -> Unit,
    val openSettings: () -> Unit,
    val newSong: () -> Unit,
    val observeSong: (String) -> Flow<SongEntity?>,
)

@Composable
fun LibraryScreen(
    state: LibraryUiState,
    playback: PlaybackState,
    actions: LibraryActions,
    bottomPadding: Dp,
) {
    var expandedId by rememberSaveable { mutableStateOf<String?>(null) }
    val isEmpty = state.loaded && state.composing.isEmpty() && state.totalSongs == 0 && state.library.isEmpty() &&
        state.query.isEmpty() && !state.favoritesOnly

    LazyColumn(
        Modifier.fillMaxSize().testTag("library"),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = bottomPadding + 96.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "header") { Header(state, actions.openSettings) }

        if (!state.isConfigured) item(key = "setup") { SetupCard(actions.openSettings) }

        if (isEmpty) {
            item(key = "empty") { EmptyState(actions.newSong) }
            return@LazyColumn
        }

        if (state.composing.isNotEmpty()) {
            item(key = "composingLabel") { SectionLabel("In the studio", Modifier.padding(top = 12.dp, bottom = 2.dp)) }
            items(state.composing, key = { it.id }) { song ->
                ComposingCard(
                    song = song,
                    expanded = expandedId == song.id,
                    onToggle = { expandedId = if (expandedId == song.id) null else song.id },
                    actions = actions,
                    modifier = Modifier.animateItem(),
                )
            }
        }

        item(key = "search") { SearchRow(state, actions) }

        if (state.library.isEmpty()) {
            item(key = "noResults") {
                Text(
                    if (state.favoritesOnly) "No favorites yet - tap the heart on a song you love." else "Nothing matches “${state.query}”.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.TextSecondary,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }

        items(state.library, key = { it.id }) { song ->
            when (song.status) {
                SongStatus.FAILED, SongStatus.CANCELLED -> FailedRow(song, actions, Modifier.animateItem())
                else -> SongRow(
                    song = song,
                    isCurrent = playback.currentSongId == song.id,
                    isPlaying = playback.isPlaying && playback.currentSongId == song.id,
                    actions = actions,
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

@Composable
private fun Header(state: LibraryUiState, onSettings: () -> Unit) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 16.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                "ArticleSong",
                style = MaterialTheme.typography.displaySmall.copy(brush = Palette.Glitch),
            )
            val minutes = kotlin.math.ceil(state.totalSeconds / 60).toInt()
            Text(
                when (state.totalSongs) {
                    0 -> "Songs made from what you read"
                    1 -> "1 song · $minutes min"
                    else -> "${state.totalSongs} songs · $minutes min"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.TextSecondary,
            )
        }
        IconButton(onClick = onSettings, modifier = Modifier.testTag("openSettings")) {
            Icon(Icons.Rounded.Settings, "Settings", tint = Palette.TextSecondary)
        }
    }
}

@Composable
private fun SetupCard(onSettings: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Palette.Card)
            .border(1.dp, Palette.Violet.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
            .clickable(onClick = onSettings)
            .padding(16.dp)
            .testTag("setupCard"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(Palette.Accent), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Key, null, tint = Color.White)
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text("Add your SunoAPI key", style = MaterialTheme.typography.titleMedium)
            Text(
                "It makes the music. An Anthropic key (optional) lets Claude write sharper lyrics.",
                style = MaterialTheme.typography.bodySmall,
                color = Palette.TextSecondary,
            )
        }
    }
}

@Composable
private fun EmptyState(onNewSong: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Artwork(null, "empty", Modifier.size(132.dp), corner = 36.dp)
        Text("Turn any article into a song", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 28.dp))
        Column(Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Step(1, "Open an article in your browser")
            Step(2, "Tap Share, then ArticleSong")
            Step(3, "Pick a style. It plays when it's ready, and it's saved here.")
        }
        GradientButton("Paste a link", onNewSong, Modifier.padding(top = 32.dp).fillMaxWidth())
    }
}

@Composable
private fun Step(n: Int, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(Palette.CardHigh), contentAlignment = Alignment.Center) {
            Text("$n", style = MaterialTheme.typography.labelLarge, color = Palette.Violet)
        }
        Text(text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 12.dp))
    }
}

@Composable
private fun SearchRow(state: LibraryUiState, actions: LibraryActions) {
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(14.dp)).background(Palette.Card).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Search, null, tint = Palette.TextTertiary, modifier = Modifier.size(20.dp))
            Box(Modifier.weight(1f).padding(start = 8.dp)) {
                if (state.query.isEmpty()) Text("Search your songs", style = MaterialTheme.typography.bodyMedium, color = Palette.TextTertiary)
                BasicTextField(
                    value = state.query,
                    onValueChange = actions.setQuery,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.merge(TextStyle(color = Palette.Text)),
                    cursorBrush = SolidColor(Palette.Violet),
                    modifier = Modifier.fillMaxWidth().testTag("search"),
                )
            }
            if (state.query.isNotEmpty()) {
                Icon(Icons.Rounded.Close, "Clear search", tint = Palette.TextTertiary, modifier = Modifier.size(18.dp).clickable { actions.setQuery("") })
            }
        }
        Box(
            Modifier
                .padding(start = 8.dp)
                .size(44.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (state.favoritesOnly) Palette.Magenta.copy(alpha = 0.18f) else Palette.Card)
                .clickable(onClick = actions.toggleFavoritesOnly),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (state.favoritesOnly) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                "Favorites only",
                tint = if (state.favoritesOnly) Palette.Magenta else Palette.TextSecondary,
            )
        }
    }
}

@Composable
private fun ComposingCard(
    song: SongSummary,
    expanded: Boolean,
    onToggle: () -> Unit,
    actions: LibraryActions,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Palette.Card)
            .clickable(onClick = onToggle)
            .animateContentSize()
            .padding(14.dp)
            .testTag("composing-${song.id}"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Artwork(song.artworkModel, song.id, Modifier.size(56.dp), corner = 14.dp, generating = !song.status.isPlayable)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(song.displayTitle, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    "${Notifier.stageText(song.status)} · ${song.styleName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (song.status.isPlayable) Palette.Cyan else Palette.TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (song.status.isPlayable) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Color.White).clickable { actions.play(song.id) },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Rounded.PlayArrow, "Play", tint = Palette.Background) }
            } else {
                IconButton(onClick = { actions.cancel(song.id) }, modifier = Modifier.testTag("cancel-${song.id}")) {
                    Icon(Icons.Rounded.Close, "Cancel", tint = Palette.TextSecondary)
                }
            }
        }
        StageStepper(song.status, Modifier.padding(top = 14.dp))
        AnimatedVisibility(expanded) {
            val full by remember(song.id) { actions.observeSong(song.id) }.collectAsState(null)
            val lyrics = full?.lyrics
            Column(Modifier.padding(top = 14.dp)) {
                if (lyrics != null) {
                    SectionLabel("Lyrics")
                    LyricsText(lyrics, Modifier.padding(top = 6.dp), large = false)
                } else {
                    Text("Lyrics will appear here as soon as they're written.", style = MaterialTheme.typography.bodySmall, color = Palette.TextTertiary)
                }
                if (song.status.isPlayable) {
                    TextButton(onClick = { actions.cancel(song.id) }) { Text("Stop making this song", color = Palette.TextSecondary) }
                }
            }
        }
    }
}

@Composable
private fun SongRow(
    song: SongSummary,
    isCurrent: Boolean,
    isPlaying: Boolean,
    actions: LibraryActions,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (isCurrent) Palette.Violet.copy(alpha = 0.12f) else Color.Transparent)
            .clickable { actions.play(song.id) }
            .padding(vertical = 6.dp, horizontal = 6.dp)
            .testTag("song-${song.id}"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Artwork(song.artworkModel, song.id, Modifier.size(58.dp), corner = 14.dp)
            if (isCurrent) {
                Box(Modifier.size(58.dp).clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                    EqualizerBars(isPlaying, Modifier.size(20.dp), color = Color.White)
                }
            }
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(
                song.displayTitle,
                style = MaterialTheme.typography.titleMedium,
                color = if (isCurrent) Palette.Violet else Palette.Text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(song.sourceSite, song.styleName, formatDuration(song.durationSec).ifEmpty { null }).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.TextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (song.favorite) Icon(Icons.Rounded.Favorite, null, tint = Palette.Magenta, modifier = Modifier.size(12.dp).padding(end = 2.dp))
                Text(
                    relativeTime(song.completedAt ?: song.createdAt) + if (song.playCount > 0) " · played ${song.playCount}×" else "",
                    style = MaterialTheme.typography.labelMedium,
                    color = Palette.TextTertiary,
                )
            }
        }
        RowMenu(song, actions)
    }
}

@Composable
private fun RowMenu(song: SongSummary, actions: LibraryActions) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Rounded.MoreVert, "More options", tint = Palette.TextTertiary) }
        DropdownMenu(open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(if (song.favorite) "Remove from favorites" else "Add to favorites") }, onClick = { open = false; actions.toggleFavorite(song.id) })
            song.sourceUrl?.let { url -> DropdownMenuItem(text = { Text("Read the article") }, onClick = { open = false; actions.openArticle(url) }) }
            if (song.isDownloaded) {
                DropdownMenuItem(text = { Text("Share song") }, leadingIcon = { Icon(Icons.Rounded.Share, null) }, onClick = { open = false; actions.share(song.id) })
            }
            DropdownMenuItem(text = { Text("New version in another style") }, onClick = { open = false; actions.regenerate(song.id) })
            DropdownMenuItem(text = { Text("Delete", color = Palette.Error) }, onClick = { open = false; actions.delete(song.id) })
        }
    }
}

@Composable
private fun FailedRow(song: SongSummary, actions: LibraryActions, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Palette.Card.copy(alpha = 0.6f))
            .padding(10.dp)
            .testTag("failed-${song.id}"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = 8.dp)) {
            Text(song.displayTitle, style = MaterialTheme.typography.titleSmall, color = Palette.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (song.status == SongStatus.CANCELLED) "Cancelled" else song.error ?: "Failed",
                style = MaterialTheme.typography.bodySmall,
                color = if (song.status == SongStatus.CANCELLED) Palette.TextTertiary else Palette.Error,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = { actions.retry(song.id) }, modifier = Modifier.testTag("retry-${song.id}")) {
            Icon(Icons.Rounded.Refresh, "Retry", tint = Palette.Text)
        }
        IconButton(onClick = { actions.delete(song.id) }) { Icon(Icons.Rounded.Close, "Dismiss", tint = Palette.TextTertiary) }
    }
}

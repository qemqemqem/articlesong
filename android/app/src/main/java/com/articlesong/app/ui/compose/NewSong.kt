package com.articlesong.app.ui.compose

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.FormatQuote
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.generate.Notifier
import com.articlesong.app.playback.PlaybackState
import com.articlesong.app.recipe.SongStyle
import com.articlesong.app.share.ShareParser
import com.articlesong.app.share.SongSource
import com.articlesong.app.ui.components.Artwork
import com.articlesong.app.ui.components.EqualizerBars
import com.articlesong.app.ui.components.GradientButton
import com.articlesong.app.ui.components.SectionLabel
import com.articlesong.app.ui.components.StageStepper
import com.articlesong.app.ui.components.StylePicker
import com.articlesong.app.ui.components.readText
import kotlinx.coroutines.launch
import com.articlesong.app.ui.player.parseLyrics
import com.articlesong.app.ui.player.LyricsLine
import com.articlesong.app.ui.theme.Palette

/**
 * "What should we sing, and how?" Used by the share sheet (source given) and by the in-app
 * "Paste a link" sheet (source typed or pasted).
 */
@Composable
fun NewSongContent(
    source: SongSource?,
    styles: List<SongStyle>,
    initialStyleId: String?,
    configured: Boolean,
    onCompose: (SongSource, SongStyle) -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedId by rememberSaveable { mutableStateOf(initialStyleId ?: styles.getOrNull(1)?.id) }
    var typed by rememberSaveable { mutableStateOf("") }
    var submitted by rememberSaveable { mutableStateOf(false) }
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    val effectiveSource = source ?: ShareParser.parseShare(typed, null)
    val style = styles.firstOrNull { it.id == selectedId } ?: styles.first()

    Column(modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("New song", style = MaterialTheme.typography.headlineMedium)

        if (source != null) {
            SourcePreview(source)
        } else {
            OutlinedTextField(
                value = typed,
                onValueChange = { typed = it },
                placeholder = { Text("Paste a link to an article") },
                leadingIcon = { Icon(Icons.Rounded.Link, null) },
                trailingIcon = {
                    IconButton(onClick = { scope.launch { clipboard.readText()?.let { typed = it } } }) {
                        Icon(Icons.Rounded.ContentPaste, "Paste")
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Palette.Outline, focusedBorderColor = Palette.Violet),
                modifier = Modifier.fillMaxWidth().testTag("linkField"),
            )
            if (typed.isNotBlank() && effectiveSource == null) {
                Text("That doesn't look like a link.", style = MaterialTheme.typography.bodySmall, color = Palette.Error)
            }
        }

        SectionLabel("Style")
        StylePicker(styles, style.id, { selectedId = it.id })
        Text(
            style.description.removePrefix("Style: "),
            style = MaterialTheme.typography.bodySmall,
            color = Palette.TextTertiary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        if (configured) {
            GradientButton(
                "Compose",
                onClick = {
                    if (!submitted) effectiveSource?.let { submitted = true; onCompose(it, style) }
                },
                enabled = effectiveSource != null && !submitted,
                icon = Icons.Rounded.MusicNote,
                modifier = Modifier.fillMaxWidth().testTag("compose"),
            )
        } else {
            SetupPrompt(onOpenSettings)
        }
    }
}

@Composable
private fun SourcePreview(source: SongSource) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Palette.Card).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Palette.CardHigh), contentAlignment = Alignment.Center) {
            Icon(if (source is SongSource.Text) Icons.Rounded.FormatQuote else Icons.Rounded.Link, null, tint = Palette.Violet)
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            when (source) {
                is SongSource.WebPage -> {
                    Text(source.titleHint ?: "Article", style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(ShareParser.siteName(source.url) ?: source.url, style = MaterialTheme.typography.bodySmall, color = Palette.TextSecondary, maxLines = 1)
                }
                is SongSource.Text -> {
                    Text("“${source.text}”", style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    Text(
                        "Highlighted text · ${source.wordCount} words" + (ShareParser.siteName(source.url)?.let { " · $it" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.TextSecondary,
                    )
                }
            }
        }
    }
}

@Composable
fun SetupPrompt(onOpenSettings: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.dp, Palette.Violet.copy(alpha = 0.5f), RoundedCornerShape(18.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Key, null, tint = Palette.Violet)
            Text("Add your SunoAPI key to start composing", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 8.dp))
        }
        GradientButton("Open settings", onOpenSettings, Modifier.fillMaxWidth())
    }
}

/** Live progress for a song we just started, shown in the share sheet. */
@Composable
fun ComposingContent(
    song: SongEntity?,
    playback: PlaybackState,
    onTogglePlay: () -> Unit,
    onPlay: () -> Unit,
    onRetry: () -> Unit,
    onKeepReading: () -> Unit,
    onOpenApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (song == null) {
            Text("Starting…", style = MaterialTheme.typography.headlineSmall)
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Artwork(song.artworkUri, song.id, Modifier.size(72.dp), corner = 18.dp, generating = song.status.isActive && !song.status.isPlayable)
            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                Text(song.displayTitle, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(song.styleName, style = MaterialTheme.typography.bodyMedium, color = Palette.TextSecondary)
            }
        }
        StageStepper(song.status)

        val headline = when (song.status) {
            SongStatus.FAILED -> "Couldn't make this song"
            SongStatus.CANCELLED -> "Cancelled"
            SongStatus.READY -> "Ready - it's in your library"
            else -> Notifier.stageText(song.status)
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.testTag("composingStatus")) {
            if (song.status.isActive) EqualizerBars(true, Modifier.size(18.dp).padding(end = 2.dp), color = Palette.Cyan, bars = 3)
            Text(
                headline,
                modifier = Modifier.padding(start = 8.dp),
                style = MaterialTheme.typography.titleMedium,
                color = if (song.status == SongStatus.FAILED) Palette.Error else Palette.Text,
            )
        }
        song.error?.takeIf { song.status == SongStatus.FAILED }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.TextSecondary)
        }

        val preview = remember(song.lyrics) {
            song.lyrics?.let { parseLyrics(it).filterIsInstance<LyricsLine.Line>().take(4).joinToString("\n") { line -> line.text } }
        }
        AnimatedVisibility(preview != null && song.status.isActive) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Palette.Card).padding(14.dp)) {
                SectionLabel("Fresh lyrics")
                Text(preview.orEmpty(), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
            }
        }

        if (song.status.isPlayable) {
            val isThisPlaying = playback.currentSongId == song.id
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Palette.CardHigh)
                    .clickable { if (isThisPlaying) onTogglePlay() else onPlay() }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                    Icon(if (isThisPlaying && playback.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = Palette.Background)
                }
                Text(
                    if (isThisPlaying && playback.isPlaying) "Playing now" else "Play it",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (song.status == SongStatus.FAILED) {
                OutlinedButton(onClick = onRetry, modifier = Modifier.weight(1f).padding(vertical = 4.dp)) {
                    Icon(Icons.Rounded.Refresh, null)
                    Text("Retry", modifier = Modifier.padding(start = 6.dp))
                }
            } else {
                OutlinedButton(onClick = onKeepReading, modifier = Modifier.weight(1f).padding(vertical = 4.dp).testTag("keepReading")) {
                    Text("Keep reading")
                }
            }
            GradientButton("Open app", onOpenApp, Modifier.weight(1f))
        }
        if (song.status.isActive && !song.status.isPlayable) {
            Text(
                "We'll notify you when it's ready. It plays automatically if auto-play is on.",
                style = MaterialTheme.typography.bodySmall,
                color = Palette.TextTertiary,
            )
        }
    }
}

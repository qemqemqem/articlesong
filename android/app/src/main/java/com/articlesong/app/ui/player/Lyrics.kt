package com.articlesong.app.ui.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.articlesong.app.ui.theme.Palette

sealed interface LyricsLine {
    data class Section(val name: String) : LyricsLine
    data class Line(val text: String) : LyricsLine
    data object Break : LyricsLine
}

/** Splits Suno-annotated lyrics ("[Chorus]" headers) into renderable lines. */
fun parseLyrics(lyrics: String): List<LyricsLine> {
    val out = mutableListOf<LyricsLine>()
    lyrics.lines().map { it.trim() }.forEach { line ->
        when {
            line.startsWith("[") && line.endsWith("]") -> {
                if (out.isNotEmpty() && out.last() !is LyricsLine.Break) out += LyricsLine.Break
                out += LyricsLine.Section(line.removeSurrounding("[", "]"))
            }
            line.isEmpty() -> if (out.isNotEmpty() && out.last() !is LyricsLine.Break) out += LyricsLine.Break
            else -> out += LyricsLine.Line(line)
        }
    }
    return out.dropLastWhile { it is LyricsLine.Break }
}

@Composable
fun LyricsText(lyrics: String, modifier: Modifier = Modifier, large: Boolean = true) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(if (large) 6.dp else 3.dp)) {
        parseLyrics(lyrics).forEach { line ->
            when (line) {
                is LyricsLine.Section -> Text(
                    line.name.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = Palette.Violet,
                    modifier = Modifier.padding(top = 4.dp),
                )
                is LyricsLine.Line -> Text(
                    line.text,
                    style = if (large) MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Medium)
                    else MaterialTheme.typography.bodyMedium,
                    color = Palette.Text,
                )
                LyricsLine.Break -> Text(" ", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

package com.articlesong.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.palette.graphics.Palette as ColorPalette
import coil3.compose.AsyncImage
import coil3.imageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.request.crossfade
import coil3.toBitmap
import com.articlesong.app.data.SongStatus
import com.articlesong.app.recipe.SongStyle
import com.articlesong.app.ui.theme.Palette
import kotlin.math.absoluteValue

private val PLACEHOLDER_GRADIENTS = listOf(
    Color(0xFF6A3DF0) to Color(0xFF2BB3FF),
    Color(0xFFFF4FB8) to Color(0xFF7C4DFF),
    Color(0xFF00C9A7) to Color(0xFF3A5BFF),
    Color(0xFFFF8A3D) to Color(0xFFFF3D77),
    Color(0xFF3DE7FF) to Color(0xFF6A3DF0),
    Color(0xFFB4F33D) to Color(0xFF00A3A3),
)

fun placeholderBrush(seed: String): Brush {
    val (a, b) = PLACEHOLDER_GRADIENTS[seed.hashCode().absoluteValue % PLACEHOLDER_GRADIENTS.size]
    return Brush.linearGradient(listOf(a, b))
}

/** Cover art with a seeded gradient behind it (shown while there's no image yet). */
@Composable
fun Artwork(
    model: Any?,
    seed: String,
    modifier: Modifier = Modifier,
    corner: Dp = 12.dp,
    generating: Boolean = false,
) {
    val shape = RoundedCornerShape(corner)
    Box(modifier.clip(shape).background(placeholderBrush(seed)), contentAlignment = Alignment.Center) {
        if (generating) {
            val transition = rememberInfiniteTransition(label = "shimmer")
            val shift by transition.animateFloat(
                0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "shift",
            )
            Box(
                Modifier.fillMaxSize().drawWithContent {
                    drawRect(
                        Brush.linearGradient(
                            listOf(Color.Transparent, Color.White.copy(alpha = 0.28f), Color.Transparent),
                            start = Offset(size.width * (shift * 2 - 1), 0f),
                            end = Offset(size.width * (shift * 2), size.height),
                        ),
                    )
                },
            )
        }
        Icon(
            Icons.Rounded.MusicNote, null,
            tint = Color.White.copy(alpha = 0.55f),
            modifier = Modifier.fillMaxSize(0.42f),
        )
        if (model != null) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(model).crossfade(true).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** A dominant color pulled from the artwork, for tinting the player background. */
@Composable
fun rememberArtworkColor(model: Any?, seed: String): Color {
    val context = LocalContext.current
    val fallback = PLACEHOLDER_GRADIENTS[seed.hashCode().absoluteValue % PLACEHOLDER_GRADIENTS.size].first
    var extracted by remember(model) { mutableStateOf<Color?>(null) }
    LaunchedEffect(model) {
        if (model == null) return@LaunchedEffect
        val result = context.imageLoader.execute(
            ImageRequest.Builder(context).data(model).allowHardware(false).size(128).build(),
        )
        val bitmap = (result as? SuccessResult)?.image?.toBitmap() ?: return@LaunchedEffect
        val palette = ColorPalette.from(bitmap).generate()
        val swatch = palette.vibrantSwatch ?: palette.dominantSwatch ?: palette.mutedSwatch
        extracted = swatch?.rgb?.let { Color(it) }
    }
    val color by animateColorAsState(extracted ?: fallback, tween(700), label = "artColor")
    return color
}

/** Little animated equalizer: marks the playing row and the "composing" state. */
@Composable
fun EqualizerBars(active: Boolean, modifier: Modifier = Modifier, color: Color = Palette.Violet, bars: Int = 4) {
    val transition = rememberInfiniteTransition(label = "eq")
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        repeat(bars) { i ->
            val height by transition.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(420 + i * 130, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                label = "bar$i",
            )
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight(if (active) height else 0.25f + 0.1f * (i % 2))
                    .clip(RoundedCornerShape(2.dp))
                    .background(color),
            )
        }
    }
}

private val STEP_LABELS = listOf("Read", "Lyrics", "Music")

/** Three-step progress: Read → Lyrics → Music, with the current step shimmering. */
@Composable
fun StageStepper(status: SongStatus, modifier: Modifier = Modifier) {
    val current = status.stage
    val transition = rememberInfiniteTransition(label = "stepper")
    val pulse by transition.animateFloat(0.35f, 1f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "pulse")
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        STEP_LABELS.forEachIndexed { index, label ->
            val done = index < current
            val active = index == current && status.isActive
            Column(Modifier.weight(1f)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .graphicsLayer {
                            alpha = if (active) pulse else 1f
                            shape = CircleShape
                            clip = true
                        }
                        .background(if (done || active) Palette.Accent else SolidColor(Palette.Outline)),
                )
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (done || active) Palette.Text else Palette.TextTertiary,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
fun GradientButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
) {
    Box(
        modifier
            .height(54.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(if (enabled) Palette.Accent else Brush.linearGradient(listOf(Palette.CardHigh, Palette.CardHigh)))
            .clickable(enabled = enabled && !loading, onClick = onClick)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.5.dp)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) {
                    Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Box(Modifier.width(8.dp))
                }
                Text(text, style = MaterialTheme.typography.titleMedium, color = if (enabled) Color.White else Palette.TextTertiary)
            }
        }
    }
}

/** The six song styles as selectable pills. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StylePicker(styles: List<SongStyle>, selectedId: String?, onSelect: (SongStyle) -> Unit, modifier: Modifier = Modifier) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        styles.forEach { style ->
            val selected = style.id == selectedId
            Box(
                Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .then(
                        if (selected) Modifier.background(Palette.Accent)
                        else Modifier.background(Palette.Card).border(1.dp, Palette.Outline, RoundedCornerShape(14.dp)),
                    )
                    .clickable { onSelect(style) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(
                    style.name,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected) Color.White else Palette.TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = Palette.TextTertiary, modifier = modifier)
}

fun formatDuration(seconds: Double?): String = seconds?.let { formatMs((it * 1000).toLong()) } ?: ""

fun formatMs(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(total / 60, total % 60)
}

fun relativeTime(epochMs: Long, now: Long = System.currentTimeMillis()): String {
    val minutes = (now - epochMs) / 60_000
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "${minutes}m ago"
        minutes < 24 * 60 -> "${minutes / 60}h ago"
        minutes < 7 * 24 * 60 -> "${minutes / (24 * 60)}d ago"
        else -> java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM).format(java.util.Date(epochMs))
    }
}

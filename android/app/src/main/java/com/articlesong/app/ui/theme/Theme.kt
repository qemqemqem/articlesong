package com.articlesong.app.ui.theme

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.articlesong.app.R

/** Dark-only, like most music apps: artwork and the accent gradient carry the color. */
object Palette {
    val Background = Color(0xFF0B0B12)
    val Surface = Color(0xFF14141E)
    val Card = Color(0xFF1B1B28)
    val CardHigh = Color(0xFF242435)
    val Outline = Color(0xFF2E2E44)
    val Text = Color(0xFFF4F3FF)
    val TextSecondary = Color(0xFFA6A4BC)
    val TextTertiary = Color(0xFF6F6D88)
    val Violet = Color(0xFF8B6CFF)
    val Azure = Color(0xFF4FA8FF)
    val Magenta = Color(0xFFFF4FB8)
    val Cyan = Color(0xFF3DE7FF)
    val Error = Color(0xFFFF6B81)
    val Success = Color(0xFF46E3A0)

    val Accent = Brush.linearGradient(listOf(Violet, Azure))
    val Glitch = Brush.linearGradient(listOf(Magenta, Violet, Cyan))
}

private fun spaceGrotesk(weight: FontWeight) = Font(
    R.font.space_grotesk,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val Display = FontFamily(
    spaceGrotesk(FontWeight.Normal),
    spaceGrotesk(FontWeight.Medium),
    spaceGrotesk(FontWeight.SemiBold),
    spaceGrotesk(FontWeight.Bold),
)

private val base = Typography()

private val AppTypography = Typography(
    displaySmall = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 38.sp, letterSpacing = (-1).sp),
    headlineMedium = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 26.sp, lineHeight = 30.sp, letterSpacing = (-0.5).sp),
    headlineSmall = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 27.sp, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 25.sp),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    titleSmall = base.titleSmall.copy(fontWeight = FontWeight.SemiBold),
    bodyLarge = base.bodyLarge,
    bodyMedium = base.bodyMedium,
    bodySmall = base.bodySmall,
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
    labelMedium = base.labelMedium.copy(fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontFamily = Display, fontWeight = FontWeight.Medium, fontSize = 11.sp, letterSpacing = 1.2.sp),
)

private val Colors = darkColorScheme(
    primary = Palette.Violet,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF2C2260),
    onPrimaryContainer = Palette.Text,
    secondary = Palette.Azure,
    onSecondary = Color.White,
    tertiary = Palette.Cyan,
    background = Palette.Background,
    onBackground = Palette.Text,
    surface = Palette.Surface,
    onSurface = Palette.Text,
    surfaceVariant = Palette.Card,
    onSurfaceVariant = Palette.TextSecondary,
    surfaceContainerLowest = Palette.Background,
    surfaceContainerLow = Palette.Surface,
    surfaceContainer = Palette.Card,
    surfaceContainerHigh = Palette.CardHigh,
    surfaceContainerHighest = Color(0xFF2C2C40),
    outline = Palette.Outline,
    outlineVariant = Color(0xFF232334),
    error = Palette.Error,
    onError = Color.White,
)

@Composable
fun ArticleSongTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = AppTypography) {
        // Text outside a Surface would otherwise default to black.
        CompositionLocalProvider(LocalContentColor provides Palette.Text, content = content)
    }
}

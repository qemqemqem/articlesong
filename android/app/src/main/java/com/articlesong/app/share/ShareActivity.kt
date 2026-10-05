package com.articlesong.app.share

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.articlesong.app.AppGraph
import com.articlesong.app.MainActivity
import com.articlesong.app.recipe.SongStyle
import com.articlesong.app.ui.components.GradientButton
import com.articlesong.app.ui.compose.ComposingContent
import com.articlesong.app.ui.compose.NewSongContent
import com.articlesong.app.ui.theme.ArticleSongTheme
import com.articlesong.app.ui.theme.Palette
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Share target ("Make a song") and text-selection action ("Sing it"). A bottom sheet slides
 * up over the app you were reading in: pick a style, tap Compose, keep reading.
 */
class ShareActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Dark UI everywhere: light status/navigation bar icons regardless of the system theme.
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        val graph = AppGraph.get(this)
        graph.player.connect()
        val source = ShareParser.parse(intent)
        setContent {
            ArticleSongTheme {
                ShareSheet(graph, source, onDone = ::finish, onOpenApp = ::openApp)
            }
        }
    }

    private fun openApp(extra: String?, songId: String?) {
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .apply {
                    when (extra) {
                        MainActivity.EXTRA_OPEN_PLAYER -> putExtra(MainActivity.EXTRA_OPEN_PLAYER, true)
                        MainActivity.EXTRA_OPEN_SETTINGS -> putExtra(MainActivity.EXTRA_OPEN_SETTINGS, true)
                        MainActivity.EXTRA_SONG_ID -> putExtra(MainActivity.EXTRA_SONG_ID, songId)
                    }
                },
        )
        finish()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareSheet(
    graph: AppGraph,
    source: SongSource?,
    onDone: () -> Unit,
    onOpenApp: (extra: String?, songId: String?) -> Unit,
) {
    val context = LocalContext.current
    val settings by graph.settings.settings.collectAsState(null)
    val playback by graph.player.state.collectAsState()
    var songId by rememberSaveable { mutableStateOf<String?>(null) }
    val song by remember(songId) { songId?.let(graph.songs::observe) ?: flowOf(null) }.collectAsState(null)
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var pendingCompose by remember { mutableStateOf<Pair<SongSource, SongStyle>?>(null) }
    fun compose(src: SongSource, style: SongStyle) {
        if (songId != null) return // one song per share, however fast the double-tap
        val id = UUID.randomUUID().toString()
        songId = id // switches the sheet to progress immediately (and survives rotation)
        graph.scope.launch {
            graph.settings.setLastStyle(style.id)
            graph.scheduler.create(src, style, id)
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        pendingCompose?.let { (src, style) -> compose(src, style) }
        pendingCompose = null
    }

    ModalBottomSheet(
        onDismissRequest = onDone,
        sheetState = sheet,
        containerColor = Palette.Surface,
        modifier = Modifier.testTag("shareSheet"),
    ) {
        val config = settings
        when {
            source == null -> Column(Modifier.fillMaxWidth().padding(24.dp)) {
                Text("Nothing to sing here", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "Share a link to an article, or highlight some text and choose “Sing it”.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.TextSecondary,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
                GradientButton("Close", onDone, Modifier.fillMaxWidth().padding(bottom = 24.dp))
            }
            config == null -> Unit
            songId == null -> NewSongContent(
                source = source,
                styles = config.styles,
                initialStyleId = config.defaultStyle.id,
                configured = config.isConfigured,
                onCompose = { src, style ->
                    val needsPermission = Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(
                        context, Manifest.permission.POST_NOTIFICATIONS,
                    ) != PackageManager.PERMISSION_GRANTED
                    if (needsPermission) {
                        pendingCompose = src to style
                        permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        compose(src, style)
                    }
                },
                onOpenSettings = { onOpenApp(MainActivity.EXTRA_OPEN_SETTINGS, null) },
                modifier = Modifier.padding(bottom = 32.dp),
            )
            else -> ComposingContent(
                song = song,
                playback = playback,
                onTogglePlay = graph.player::togglePlayPause,
                onPlay = { songId?.let { graph.player.play(listOf(it), it) } },
                onRetry = { songId?.let { id -> graph.scope.launch { graph.scheduler.retry(id) } } },
                onKeepReading = onDone,
                onOpenApp = {
                    if (song?.status?.isPlayable == true) onOpenApp(MainActivity.EXTRA_OPEN_PLAYER, songId)
                    else onOpenApp(MainActivity.EXTRA_SONG_ID, songId)
                },
                modifier = Modifier.padding(bottom = 32.dp),
            )
        }
    }
}

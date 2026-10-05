package com.articlesong.app.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.articlesong.app.MainActivity
import com.articlesong.app.ui.compose.NewSongContent
import com.articlesong.app.ui.components.StylePicker
import com.articlesong.app.ui.library.LibraryActions
import com.articlesong.app.ui.library.LibraryScreen
import com.articlesong.app.ui.player.MiniPlayer
import com.articlesong.app.ui.player.NowPlayingScreen
import com.articlesong.app.ui.player.PlayerActions
import com.articlesong.app.ui.player.rememberPositionMs
import com.articlesong.app.ui.settings.SettingsScreen
import com.articlesong.app.ui.theme.Palette
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

private enum class Screen { Library, Settings }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(vm: AppViewModel, pendingIntent: MutableStateFlow<Intent?>) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val library by vm.library.collectAsState()
    val settings by vm.settings.collectAsState()
    val playback by vm.player.state.collectAsState()
    val currentSong by remember(playback.currentSongId) {
        playback.currentSongId?.let(vm::observeSong) ?: flowOf(null)
    }.collectAsState(null)
    val position = rememberPositionMs(vm.player, playback)

    var screen by rememberSaveable { mutableStateOf(Screen.Library) }
    var playerExpanded by rememberSaveable { mutableStateOf(false) }
    var showNewSong by rememberSaveable { mutableStateOf(false) }
    var deleting by rememberSaveable { mutableStateOf<String?>(null) }
    var regenerating by rememberSaveable { mutableStateOf<String?>(null) }
    val snackbar = remember { SnackbarHostState() }

    // Ask once for notification permission: progress and "song ready" alerts depend on it.
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    // Notification taps / share-sheet hand-offs
    val intent by pendingIntent.collectAsState()
    LaunchedEffect(intent) {
        val i = intent ?: return@LaunchedEffect
        i.getStringExtra(MainActivity.EXTRA_PLAY_SONG_ID)?.let { id ->
            vm.play(id)
            playerExpanded = true
        }
        if (i.getBooleanExtra(MainActivity.EXTRA_OPEN_PLAYER, false)) playerExpanded = true
        if (i.getBooleanExtra(MainActivity.EXTRA_OPEN_SETTINGS, false)) {
            playerExpanded = false
            screen = Screen.Settings
        }
        pendingIntent.value = null
    }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(playback.error) {
        playback.error?.let {
            snackbar.showSnackbar(it)
            vm.player.clearError()
        }
    }

    val openArticle: (String) -> Unit = { url -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    val share: (String) -> Unit = { id ->
        scope.launch { vm.shareIntent(id)?.let { context.startActivity(Intent.createChooser(it, "Share song")) } }
    }
    val playerActions = PlayerActions(
        toggle = vm.player::togglePlayPause,
        seek = vm.player::seekTo,
        next = vm.player::next,
        previous = vm.player::previous,
        shuffle = vm.player::toggleShuffle,
        repeat = vm.player::cycleRepeat,
        favorite = vm::toggleFavorite,
        openArticle = openArticle,
        share = share,
        saveToMusic = vm::saveToMusic,
        regenerate = { regenerating = it },
        delete = { deleting = it },
    )
    val libraryActions = LibraryActions(
        play = vm::play,
        toggleFavorite = vm::toggleFavorite,
        cancel = vm::cancel,
        retry = vm::retry,
        delete = { deleting = it },
        share = share,
        openArticle = openArticle,
        regenerate = { regenerating = it },
        setQuery = vm::setQuery,
        toggleFavoritesOnly = vm::toggleFavoritesOnly,
        openSettings = { screen = Screen.Settings },
        newSong = { showNewSong = true },
        observeSong = vm::observeSong,
    )

    BackHandler(playerExpanded) { playerExpanded = false }
    BackHandler(!playerExpanded && screen == Screen.Settings) { screen = Screen.Library }

    Box(Modifier.fillMaxSize().background(Palette.Background)) {
        AnimatedContent(
            screen,
            transitionSpec = {
                if (targetState == Screen.Settings) slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 3 } + fadeOut()
                else slideInHorizontally { -it / 3 } + fadeIn() togetherWith slideOutHorizontally { it }
            },
            label = "screen",
        ) { target ->
            when (target) {
                Screen.Library -> Box(Modifier.fillMaxSize()) {
                    LibraryScreen(library, playback, libraryActions, bottomPadding = if (currentSong != null) 76.dp else 0.dp)
                    Column(
                        Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalAlignment = Alignment.End,
                    ) {
                        val hasSongs = library.composing.isNotEmpty() || library.totalSongs > 0 || library.library.isNotEmpty()
                        if (library.loaded && library.isConfigured && hasSongs) NewSongButton { showNewSong = true }
                        MiniPlayer(
                            playback, currentSong, position,
                            onExpand = { playerExpanded = true },
                            actions = playerActions,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
                Screen.Settings -> settings?.let { SettingsScreen(it, vm) { screen = Screen.Library } }
            }
        }

        AnimatedVisibility(
            playerExpanded && currentSong != null,
            enter = slideInVertically(tween(320)) { it },
            exit = slideOutVertically(tween(260)) { it },
        ) {
            NowPlayingScreen(playback, currentSong, position, onCollapse = { playerExpanded = false }, actions = playerActions)
        }

        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 96.dp))
    }

    if (showNewSong) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { showNewSong = false }, sheetState = sheet, containerColor = Palette.Surface) {
            settings?.let { config ->
                NewSongContent(
                    source = null,
                    styles = config.styles,
                    initialStyleId = config.defaultStyle.id,
                    configured = config.isConfigured,
                    onCompose = { source, style ->
                        vm.createSong(source, style)
                        showNewSong = false
                    },
                    onOpenSettings = { showNewSong = false; screen = Screen.Settings },
                    modifier = Modifier.padding(bottom = 32.dp),
                )
            }
        }
    }

    regenerating?.let { id ->
        settings?.let { config ->
            var chosen by remember(id) { mutableStateOf(config.defaultStyle.id) }
            AlertDialog(
                onDismissRequest = { regenerating = null },
                title = { Text("New version") },
                text = {
                    Column {
                        Text("Same article, different sound. Pick a style:", style = MaterialTheme.typography.bodyMedium, color = Palette.TextSecondary)
                        StylePicker(config.styles, chosen, { chosen = it.id }, Modifier.padding(top = 16.dp))
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        config.styles.firstOrNull { it.id == chosen }?.let { vm.regenerate(id, it) }
                        regenerating = null
                    }) { Text("Compose") }
                },
                dismissButton = { TextButton(onClick = { regenerating = null }) { Text("Cancel") } },
            )
        }
    }

    deleting?.let { id ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Delete this song?") },
            text = { Text("It's removed from ArticleSong. A copy saved to your Music folder stays there.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.delete(id)
                    if (playback.currentSongId == id) playerExpanded = false
                    deleting = null
                }) { Text("Delete", color = Palette.Error) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun NewSongButton(onClick: () -> Unit) {
    Box(
        Modifier
            .shadow(12.dp, RoundedCornerShape(20.dp))
            .clip(RoundedCornerShape(20.dp))
            .background(Palette.Accent)
            .testTag("newSong")
            .then(Modifier.padding(0.dp)),
    ) {
        TextButton(onClick = onClick, modifier = Modifier.padding(horizontal = 6.dp)) {
            Icon(Icons.Rounded.Add, null, tint = Color.White, modifier = Modifier.size(20.dp))
            Text("New song", modifier = Modifier.padding(start = 6.dp), style = MaterialTheme.typography.titleSmall, color = Color.White)
        }
    }
}

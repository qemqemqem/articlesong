package com.articlesong.app

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.articlesong.app.ui.AppRoot
import com.articlesong.app.ui.AppViewModel
import com.articlesong.app.ui.theme.ArticleSongTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = AppViewModel(AppGraph.get(this@MainActivity)) as T
        }
    }

    /** The latest intent with something for the UI to do (play a song, open settings…). */
    private val pendingIntent = MutableStateFlow<Intent?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Dark UI everywhere: light status/navigation bar icons regardless of the system theme.
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        if (savedInstanceState == null) pendingIntent.value = intent
        setContent {
            ArticleSongTheme { AppRoot(vm, pendingIntent) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingIntent.value = intent
    }

    companion object {
        const val EXTRA_SONG_ID = "song_id"
        const val EXTRA_PLAY_SONG_ID = "play_song_id"
        const val EXTRA_OPEN_PLAYER = "open_player"
        const val EXTRA_OPEN_SETTINGS = "open_settings"
    }
}

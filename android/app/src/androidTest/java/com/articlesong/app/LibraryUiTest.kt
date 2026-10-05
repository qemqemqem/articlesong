package com.articlesong.app

import android.Manifest
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import androidx.test.uiautomator.UiDevice
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class LibraryUiTest {
    @get:Rule val compose = createEmptyComposeRule()
    @get:Rule val notifications: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    private val fake = FakeApis()
    private val graph get() = TestApp.graph

    @Before
    fun setUp() = runBlocking {
        fake.start()
        TestApp.reset(fake, autoPlay = false)
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        listOf(
            Triple("bees", "The Waggle Dance", "sciencedaily.com"),
            Triple("tides", "Moon Pull", "nasa.gov"),
            Triple("chips", "Silicon Sunrise", "theverge.com"),
        ).forEachIndexed { i, (id, title, site) ->
            val audio = graph.files.audioFile(id).apply { assets.open("fixture.mp3").use { input -> outputStream().use { input.copyTo(it) } } }
            val cover = graph.files.coverFile(id).apply { assets.open("cover.jpg").use { input -> outputStream().use { input.copyTo(it) } } }
            graph.songs.insert(
                SongEntity(
                    id = id, createdAt = 1_000L + i, completedAt = 2_000L + i, sourceUrl = "https://$site/story", sourceTitle = "$title article",
                    sourceSite = site, articleText = "text", styleId = "pop", styleName = "Pop", styleDescription = "Catchy hooks",
                    status = SongStatus.READY, lyrics = "[Verse]\nLine one about $title\n[Chorus]\nSing along", title = title,
                    audioPath = audio.absolutePath, imagePath = cover.absolutePath, durationSec = 8.0,
                ),
            )
        }
        graph.songs.insert(
            SongEntity(
                id = "broken", createdAt = 500, sourceUrl = fake.baseUrl.resolve("article").toString(), sourceTitle = "Broken story", sourceSite = "example.com",
                styleId = "pop", styleName = "Pop", styleDescription = "Catchy", status = SongStatus.FAILED, error = "insufficient SunoAPI credits",
            ),
        )
    }

    @After
    fun tearDown() = fake.close()

    @Test
    fun browseSearchPlayAndManageSongs() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithTag("song-bees").assertIsDisplayed()
            compose.onNodeWithTag("song-chips").assertIsDisplayed()
            compose.onNodeWithText("insufficient SunoAPI credits").assertIsDisplayed()
            compose.onNodeWithText("3 songs", substring = true).assertIsDisplayed()

            // Search
            compose.onNodeWithTag("search").performTextInput("moon")
            compose.waitUntil(5_000) { compose.onAllNodesWithTag("song-bees").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("song-tides").assertIsDisplayed()
            compose.onNodeWithContentDescription("Clear search").performClick()

            // Tap to play: queue is the library, starting at the tapped song
            compose.onNodeWithTag("song-tides").performClick()
            compose.waitUntil(15_000) { graph.player.state.value.isPlaying }
            val playback = graph.player.state.value
            assertThat(playback.currentSongId).isEqualTo("tides")
            assertThat(playback.queueIds).containsExactly("chips", "tides", "bees").inOrder()

            // Expand the player, show lyrics, favorite it
            compose.onNodeWithTag("miniPlayer").performClick()
            compose.onNodeWithTag("nowPlaying").assertIsDisplayed()
            compose.onNodeWithText("Lyrics").performClick()
            compose.onNodeWithText("Line one about Moon Pull").assertIsDisplayed()
            compose.onNodeWithContentDescription("Favorite").performClick()
            compose.waitUntil(5_000) { runBlocking { graph.songs.get("tides")!!.favorite } }
            compose.onNodeWithTag("nowPlayingPlayPause").performClick()
            compose.waitUntil(5_000) { !graph.player.state.value.isPlaying }
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
            compose.waitUntil(5_000) { compose.onAllNodesWithTag("nowPlaying").fetchSemanticsNodes().isEmpty() }

            // Delete with confirmation: row menu -> Delete -> confirm
            val chipsAudio = File(runBlocking { graph.songs.get("chips")!!.audioPath!! })
            compose.onNode(hasAnyAncestor(hasTestTag("song-chips")) and hasContentDescription("More options")).performClick()
            compose.onNodeWithText("Delete").performClick()
            compose.onNodeWithText("Delete this song?").assertIsDisplayed()
            compose.onNodeWithText("Delete").performClick()
            compose.waitUntil(5_000) { compose.onAllNodesWithTag("song-chips").fetchSemanticsNodes().isEmpty() }
            assertThat(chipsAudio.exists()).isFalse()
            assertThat(runBlocking { graph.songs.get("chips") }).isNull()
        }
    }

    @Test
    fun retryFromTheLibrary() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithTag("retry-broken").performClick()
            runBlocking { TestApp.awaitSong("broken") { it.status != SongStatus.FAILED } } // retry took effect
            val song = runBlocking { TestApp.awaitStatus("broken", SongStatus.READY) }
            assertThat(song.lyrics).isEqualTo(FakeApis.LYRICS)
        }
    }

    @Test
    fun settingsTestsBothKeys() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithTag("openSettings").performClick()
            compose.waitForIdle() // let the screen finish sliding in
            compose.onNodeWithTag("sunoKey-test").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("sunoKey-result").fetchSemanticsNodes().isNotEmpty() }
            compose.waitForIdle()
            compose.onNodeWithText("420 credits left", substring = true).assertIsDisplayed()
            compose.onNodeWithTag("anthropicKey-test").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("anthropicKey-result").fetchSemanticsNodes().isNotEmpty() }
            compose.waitForIdle()
            compose.onNodeWithText("Using claude-opus-5-5", substring = true).assertIsDisplayed()
        }
    }
}

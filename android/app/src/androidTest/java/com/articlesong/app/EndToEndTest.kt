package com.articlesong.app

import android.Manifest
import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.articlesong.app.data.SongStatus
import com.articlesong.app.share.ShareActivity
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.time.Duration.Companion.seconds

/**
 * The whole product on a real device: share sheet -> WorkManager job -> WebView extraction ->
 * Claude (SDK) -> Suno -> live stream auto-plays in Media3 -> MP3 downloaded into the library.
 * Only the network is fake.
 */
@RunWith(AndroidJUnit4::class)
class EndToEndTest {
    @get:Rule val compose = createEmptyComposeRule()
    @get:Rule val notifications: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    private val fake = FakeApis()
    private val graph get() = TestApp.graph

    @Before
    fun setUp() = runBlocking {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        fake.audioBytes = assets.open("long.mp3").use { it.readBytes() } // long enough to still be playing when we check
        fake.coverBytes = assets.open("cover.jpg").use { it.readBytes() }
        fake.start()
        TestApp.reset(fake)
    }

    @After
    fun tearDown() {
        graph.player.clear()
        fake.close()
    }

    private fun shareIntent(text: String, subject: String? = null) =
        Intent(TestApp.app, ShareActivity::class.java)
            .setAction(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text)
            .apply { subject?.let { putExtra(Intent.EXTRA_SUBJECT, it) } }

    private fun newestSongId(): String = runBlocking {
        withTimeout(10.seconds) { graph.songs.summaries.first { it.isNotEmpty() }.first().id }
    }

    @Test
    fun shareALinkAndItPlaysThenSavesToTheLibrary() {
        val url = fake.baseUrl.resolve("article").toString()
        ActivityScenario.launch<ShareActivity>(shareIntent(url, "How bees dance - Science Daily")).use {
            compose.onNodeWithText("How bees dance - Science Daily").assertIsDisplayed()
            compose.onNodeWithText("Meme").performClick()
            compose.onNodeWithTag("compose").performClick()

            val id = newestSongId()
            // Auto-play starts on Suno's live stream, before the final file exists.
            compose.waitUntil(30_000) { compose.onAllNodesWithText("Playing now", substring = true).fetchSemanticsNodes().isNotEmpty() }

            val song = runBlocking { TestApp.awaitStatus(id, SongStatus.READY) }
            assertThat(song.styleName).isEqualTo("Meme")
            assertThat(song.sourceTitle).isEqualTo("How bees dance - Science Daily")
            assertThat(song.articleText).contains("waggle dance")
            assertThat(song.lyricsProvider).isEqualTo("anthropic")
            assertThat(song.lyrics).isEqualTo(FakeApis.LYRICS)
            assertThat(song.title).isEqualTo("The Waggle Dance")
            assertThat(File(song.audioPath!!).readBytes()).isEqualTo(fake.audioBytes)
            assertThat(File(song.imagePath!!).exists()).isTrue()

            // Claude got the add-on's lyrics prompt for the extracted article, in the Meme style
            val claude = fake.requestsTo("/v1/messages").map { it.body!!.utf8() }
            assertThat(claude.first()).contains("MEME SONG")
            assertThat(claude.first()).contains("Karl von Frisch")
            assertThat(fake.requestsTo("/api/v1/generate").single().body!!.utf8()).contains(fake.styleTags)

            val playback = graph.player.state.value
            assertThat(playback.currentSongId).isEqualTo(id)
            assertThat(playback.isPlaying).isTrue()
            compose.onNodeWithText("Ready - it's in your library").assertIsDisplayed()
        }
    }

    @Test
    fun doubleTappingComposeMakesOneSong() {
        ActivityScenario.launch<ShareActivity>(shareIntent(fake.baseUrl.resolve("article").toString())).use {
            compose.onNodeWithTag("compose").performClick()
            // The sheet switches to progress at once, so there's nothing left to tap twice.
            assertThat(compose.onAllNodesWithTag("compose").fetchSemanticsNodes()).isEmpty()
            val id = newestSongId()
            runBlocking { TestApp.awaitStatus(id, SongStatus.READY) }
            assertThat(runBlocking { graph.songs.summaries.first() }.map { it.id }).containsExactly(id)
            assertThat(fake.requestsTo("/api/v1/generate")).hasSize(1)
        }
    }

    @Test
    fun highlightedTextIsSungWithoutFetchingAPage() {
        val words = "Bumblebees can fly in cold weather because they shiver their flight muscles to warm up first"
        val intent = Intent(TestApp.app, ShareActivity::class.java)
            .setAction(Intent.ACTION_PROCESS_TEXT)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_PROCESS_TEXT, words)
        ActivityScenario.launch<ShareActivity>(intent).use {
            compose.onNodeWithText("Highlighted text", substring = true).assertIsDisplayed()
            compose.onNodeWithTag("compose").performClick()
            val song = runBlocking { TestApp.awaitStatus(newestSongId(), SongStatus.READY) }
            assertThat(song.articleText).isEqualTo(words)
            assertThat(fake.requestsTo("/article")).isEmpty()
            assertThat(fake.requestsTo("/v1/messages").first().body!!.utf8()).contains("shiver their flight muscles")
        }
    }

    @Test
    fun failuresAreShownAndRetryRecovers() {
        fake.sunoStatuses = listOf("PENDING", "GENERATE_AUDIO_FAILED")
        fake.sunoErrorMessage = "Suno is overloaded"
        val url = fake.baseUrl.resolve("article").toString()
        ActivityScenario.launch<ShareActivity>(shareIntent(url)).use {
            compose.onNodeWithTag("compose").performClick()
            val id = newestSongId()
            val failed = runBlocking { TestApp.awaitStatus(id, SongStatus.FAILED) }
            assertThat(failed.error).contains("Suno is overloaded")
            compose.onNodeWithText("Couldn't make this song").assertIsDisplayed()

            fake.sunoStatuses = listOf("SUCCESS")
            compose.onNodeWithText("Retry", substring = true).performClick()
            runBlocking { TestApp.awaitSong(id) { it.status != SongStatus.FAILED } } // retry took effect
            val fixed = runBlocking { TestApp.awaitStatus(id, SongStatus.READY) }
            assertThat(fixed.audioPath).isNotNull()
            // The article and lyrics were reused; only Suno ran again.
            assertThat(fake.requestsTo("/article").filter { it.method == "GET" }).hasSize(1)
            assertThat(fake.requestsTo("/api/v1/generate")).hasSize(2)
        }
    }

    @Test
    fun missingKeySendsYouToSettings() {
        runBlocking { graph.settings.setSunoApiKey("") }
        ActivityScenario.launch<ShareActivity>(shareIntent("https://example.com/story")).use {
            compose.onNodeWithText("Add your SunoAPI key", substring = true).assertIsDisplayed()
            compose.onNodeWithText("Open settings").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithText("API KEYS").fetchSemanticsNodes().isNotEmpty() }
        }
    }

    @Test
    fun nothingToSingExplainsWhatToShare() {
        ActivityScenario.launch<ShareActivity>(shareIntent("hi")).use {
            compose.onNodeWithText("Nothing to sing here").assertIsDisplayed()
        }
    }
}

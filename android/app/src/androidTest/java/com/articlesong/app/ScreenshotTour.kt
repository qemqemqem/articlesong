package com.articlesong.app

import android.Manifest
import android.content.Intent
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.UiDevice
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.share.ShareActivity
import com.articlesong.app.testing.FakeApis
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import org.junit.runners.model.Statement

/**
 * Not an assertion test: walks the main screens with realistic data and saves screenshots to
 * /sdcard/Download/articlesong-tour/. Excluded from normal test runs; `just screenshots` runs it
 * with the `tour=true` instrumentation argument and pulls the images.
 */
@RunWith(AndroidJUnit4::class)
class ScreenshotTour {
    // Outermost, so the skip is reported as "skipped" rather than wrapped by the compose rule.
    @get:Rule(order = 0) val onlyWhenRequested = TestRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                assumeTrue("Run with -e tour true (just screenshots)", InstrumentationRegistry.getArguments().getString("tour") == "true")
                base.evaluate()
            }
        }
    }
    @get:Rule(order = 1) val compose = createEmptyComposeRule()
    @get:Rule(order = 2) val notifications: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    private val fake = FakeApis()
    private val graph get() = TestApp.graph
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val now = System.currentTimeMillis()

    @Before
    fun setUp() = runBlocking {
        val assets = instrumentation.context.assets
        fake.audioBytes = assets.open("fixture.mp3").use { it.readBytes() }
        fake.coverBytes = assets.open("art3.jpg").use { it.readBytes() }
        fake.start()
        TestApp.reset(fake, autoPlay = false)
        shell("mkdir -p /sdcard/Download/articlesong-tour")
    }

    @After
    fun tearDown() = fake.close()

    private fun seed() = runBlocking {
        val assets = instrumentation.context.assets
        fun copy(asset: String, to: java.io.File) = to.apply { assets.open(asset).use { i -> outputStream().use { i.copyTo(it) } } }
        data class Seed(val id: String, val title: String, val site: String, val style: String, val art: String, val minutesAgo: Int, val fav: Boolean, val plays: Int)
        listOf(
            Seed("neon", "Neon Pollinators", "wired.com", "Pop", "art2.jpg", 12, true, 4),
            Seed("waggle", "The Waggle Dance", "sciencedaily.com", "Musical", "art1.jpg", 95, false, 2),
            Seed("tidal", "Tidal Lock Lullaby", "nasa.gov", "Cute", "art3.jpg", 60 * 26, false, 7),
            Seed("fed", "Inflation Blues (Rate Hike Remix)", "economist.com", "Meme", "art4.jpg", 60 * 24 * 3, true, 1),
        ).forEachIndexed { i, s ->
            graph.songs.insert(
                SongEntity(
                    id = s.id, createdAt = now - s.minutesAgo * 60_000L - 1, completedAt = now - s.minutesAgo * 60_000L,
                    sourceUrl = "https://${s.site}/story", sourceTitle = s.title, sourceSite = s.site, articleText = "text",
                    styleId = s.style.lowercase(), styleName = s.style, styleDescription = "desc", status = SongStatus.READY,
                    lyrics = FakeApis.LYRICS + "\n\n[Bridge]\nIf every flower is a sentence in the field,\nThen every dance's a story that the sunlight has revealed.",
                    title = s.title, audioPath = copy("long.mp3", graph.files.audioFile(s.id)).absolutePath,
                    imagePath = copy(s.art, graph.files.coverFile(s.id)).absolutePath, durationSec = 190.0 - i * 17,
                    favorite = s.fav, playCount = s.plays,
                ),
            )
        }
        graph.songs.insert(
            SongEntity(
                id = "octopus", createdAt = now - 30_000, sourceUrl = "https://www.nationalgeographic.com/octopus-dreams",
                sourceTitle = "Do octopuses dream? Their skin flickers while they sleep", sourceSite = "nationalgeographic.com",
                styleId = "spoken", styleName = "Spoken", styleDescription = "d", status = SongStatus.WRITING_LYRICS,
            ),
        )
        graph.songs.insert(
            SongEntity(
                id = "streaming", createdAt = now - 90_000, sourceUrl = "https://arstechnica.com/quantum",
                sourceTitle = "Quantum computers just got a lot less noisy", sourceSite = "arstechnica.com",
                styleId = "informative", styleName = "Informative", styleDescription = "d", status = SongStatus.STREAMING,
                title = "Less Noise, More Qubits", imagePath = copy("art1.jpg", graph.files.coverFile("streaming")).absolutePath,
                lyrics = FakeApis.LYRICS,
            ),
        )
        graph.songs.insert(
            SongEntity(
                id = "failed", createdAt = now - 60_000L * 60 * 30, sourceUrl = "https://example.com/paywall", sourceTitle = "Paywalled thoughts",
                sourceSite = "example.com", styleId = "pop", styleName = "Pop", styleDescription = "d", status = SongStatus.FAILED,
                error = "SunoAPI error 429: insufficient SunoAPI credits",
            ),
        )
    }

    @Test
    fun tour() {
        ActivityScenario.launch(MainActivity::class.java).use {
            settle()
            snap("00_empty")
            seed()
            settle()
            compose.onNodeWithTag("song-neon").performClick()
            compose.waitUntil(10_000) { graph.player.state.value.isPlaying }
            runBlocking { delay(2500) }
            snap("01_library")

            compose.onNodeWithTag("composing-octopus").performClick()
            settle()
            snap("02_composing_expanded")
            compose.onNodeWithTag("composing-octopus").performClick()

            compose.onNodeWithTag("miniPlayer").performClick()
            compose.waitUntil(5_000) { compose.onAllNodesWithTag("nowPlaying").fetchSemanticsNodes().isNotEmpty() }
            runBlocking { delay(2000) }
            snap("03_now_playing")
            compose.onNode(hasText("Lyrics") and hasAnyAncestor(hasTestTag("nowPlaying"))).performClick()
            settle()
            snap("04_lyrics")
            UiDevice.getInstance(instrumentation).pressBack()
            settle()

            compose.onNodeWithTag("openSettings").performClick()
            settle()
            snap("05_settings")
            UiDevice.getInstance(instrumentation).pressBack()
            settle()

            compose.onNodeWithTag("newSong").performClick()
            settle()
            snap("06_new_song_sheet")
            UiDevice.getInstance(instrumentation).pressBack()
            graph.player.togglePlayPause()
        }
        runBlocking { graph.settings.setAutoPlay(true) }

        val share = Intent(TestApp.app, ShareActivity::class.java)
            .setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, fake.baseUrl.resolve("article").toString())
            .putExtra(Intent.EXTRA_SUBJECT, "How bees dance - Science Daily")
        ActivityScenario.launch<ShareActivity>(share).use {
            settle()
            snap("07_share_sheet")
            compose.onNodeWithText("Informative").performClick()
            compose.onNodeWithTag("compose").performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("composingStatus").fetchSemanticsNodes().isNotEmpty() }
            runBlocking { delay(2500) }
            snap("08_share_composing")
            compose.waitUntil(30_000) { graph.player.state.value.isPlaying }
            runBlocking { delay(1500) }
            snap("09_share_playing")
        }
    }

    private fun settle() {
        compose.waitForIdle()
        runBlocking { delay(700) }
    }

    private fun snap(name: String) {
        shell("screencap -p /sdcard/Download/articlesong-tour/$name.png")
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).close()
        runBlocking { delay(400) }
    }
}

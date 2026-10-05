package com.articlesong.app

import android.Manifest
import android.content.Intent
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.UiDevice
import com.articlesong.app.data.SongStatus
import com.articlesong.app.share.ShareActivity
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.time.Duration.Companion.seconds

/**
 * The real-life flow: share from the browser, tap Compose, go back to reading. The song must
 * start playing on its own in the background - as a proper media foreground service, so
 * Android neither blocks nor mutes it.
 */
@RunWith(AndroidJUnit4::class)
class BackgroundAutoPlayTest {
    @get:Rule val compose = createEmptyComposeRule()
    @get:Rule val notifications: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    private val fake = FakeApis()
    private val graph get() = TestApp.graph
    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    @Before
    fun setUp() = runBlocking {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        fake.audioBytes = assets.open("long.mp3").use { it.readBytes() } // long enough to still be playing when we check
        fake.start()
        TestApp.reset(fake)
        // Give us time to leave the app before Suno "starts streaming".
        fake.sunoStatuses = List(40) { "PENDING" } + listOf("TEXT_SUCCESS", "SUCCESS")
    }

    @After
    fun tearDown() = fake.close()

    @Test
    fun songAutoPlaysAfterYouGoBackToReading() {
        val intent = Intent(TestApp.app, ShareActivity::class.java)
            .setAction(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, fake.baseUrl.resolve("article").toString())
        ActivityScenario.launch<ShareActivity>(intent).use {
            compose.onNodeWithTag("compose").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("keepReading").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("keepReading").performClick()
            device.pressHome()

            val id = runBlocking { graph.songs.summaries.first { it.isNotEmpty() }.first().id }
            runBlocking { TestApp.awaitStatus(id, SongStatus.STREAMING, timeoutSec = 90) }
            runBlocking {
                withTimeout(20.seconds) { while (!graph.player.state.value.isPlaying) delay(100) }
            }
            assertThat(graph.player.state.value.currentSongId).isEqualTo(id)

            val services = shell("dumpsys activity services ${TestApp.app.packageName}/com.articlesong.app.playback.PlaybackService")
            assertThat(services).contains("isForeground=true")
            runBlocking { TestApp.awaitStatus(id, SongStatus.READY) }
        }
    }

    private fun shell(command: String): String =
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command).let { fd ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(fd).bufferedReader().use { it.readText() }
        }
}

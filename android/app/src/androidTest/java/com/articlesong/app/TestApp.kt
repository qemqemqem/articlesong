package com.articlesong.app

import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongStatus
import com.articlesong.app.generate.PipelineTiming
import com.articlesong.app.testing.FakeApis
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/** Points the real app (same process) at [FakeApis] and gives each test a clean library. */
object TestApp {
    val app: ArticleSongApp get() = ApplicationProvider.getApplicationContext()
    val graph: AppGraph get() = app.graph

    suspend fun reset(fake: FakeApis, autoPlay: Boolean = true, saveToMusic: Boolean = false) {
        WorkManager.getInstance(app).cancelAllWork().result.get()
        graph.player.clear()
        graph.songs.summaries.first().forEach { graph.deleteSong(it.id) }
        graph.endpoints = ApiEndpoints(suno = fake.baseUrl.toString(), anthropic = fake.baseUrl.toString().removeSuffix("/"))
        graph.pipelineTiming = PipelineTiming(sunoPollInterval = 300.milliseconds)
        graph.settings.apply {
            setSunoApiKey("suno-test-key")
            setAnthropicApiKey("sk-ant-test")
            setClaudeModelOverride("")
            setAutoPlay(autoPlay)
            setSaveToMusic(saveToMusic)
            resetStyles()
        }
    }

    suspend fun awaitSong(id: String, timeoutSec: Int = 60, predicate: (SongEntity) -> Boolean): SongEntity =
        withTimeout(timeoutSec.seconds) { graph.songs.observe(id).filterNotNull().first(predicate) }

    suspend fun awaitStatus(id: String, status: SongStatus, timeoutSec: Int = 60) = awaitSong(id, timeoutSec) {
        check(it.status != SongStatus.FAILED || status == SongStatus.FAILED) { "Song failed: ${it.error}" }
        it.status == status
    }
}

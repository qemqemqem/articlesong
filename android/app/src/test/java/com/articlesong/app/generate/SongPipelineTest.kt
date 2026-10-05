package com.articlesong.app.generate

import com.articlesong.app.api.Effort
import com.articlesong.app.api.LyricsWriter
import com.articlesong.app.api.SunoClient
import com.articlesong.app.data.AppSettings
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongMissingException
import com.articlesong.app.data.SongStatus
import com.articlesong.app.data.SongStore
import com.articlesong.app.extract.ArticleExtractionException
import com.articlesong.app.extract.ExtractedArticle
import com.articlesong.app.recipe.SongRecipe
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

class SongPipelineTest {
    private val recipe = SongRecipe.parse(File(System.getProperty("articlesong.recipe")!!).readText())
    private val style = recipe.defaultStyles.first { it.id == "musical" }
    private lateinit var fake: FakeApis
    private val store = FakeStore()
    private val events = mutableListOf<String>()
    private val writerCalls = mutableListOf<Triple<String, String, Effort>>()
    private var anthropicKey = "sk-ant-test"
    private var saveToMusic = true
    private var extractedUrls = mutableListOf<String>()
    private var extractor: suspend (String) -> ExtractedArticle = { url ->
        extractedUrls += url
        ExtractedArticle("How bees dance", "Honeybees dance. ".repeat(40), "Science Daily")
    }
    private val tmp: File = Files.createTempDirectory("songs").toFile()

    @Before
    fun setUp() {
        fake = FakeApis().start()
    }

    @After
    fun tearDown() {
        fake.close()
        tmp.deleteRecursively()
    }

    private fun pipeline(onStatus: ((SongEntity) -> Unit)? = null) = SongPipeline(
        store = store.also { it.onUpdate = onStatus },
        extractor = { url -> extractor(url) },
        suno = SunoClient(OkHttpClient(), { fake.baseUrl }, { "suno-key" }),
        downloads = object : SongDownloads {
            override suspend fun downloadAudio(id: String, url: String) = File(tmp, "$id.mp3").apply { writeText(url) }
            override suspend fun downloadCover(id: String, url: String) = File(tmp, "$id.jpg").apply { writeText(url) }
            override suspend fun exportToMusic(song: SongEntity): String = "content://media/external/audio/media/7".also { events += "export" }
            override fun discard(id: String) { events += "discard" }
        },
        recipe = recipe,
        settings = {
            AppSettings("suno-key", anthropicKey, "V6", "", autoPlay = true, saveToMusic = saveToMusic, styles = recipe.defaultStyles, lastStyleId = null)
        },
        lyricsWriter = { config ->
            if (config.anthropicApiKey.isBlank()) null else LyricsWriter { system, prompt, _, effort ->
                writerCalls += Triple(system, prompt, effort)
                if (system == recipe.styleSystemPrompt) "Sunlit Indie Folk, Warm, 96 BPM" else "[Verse]\nThe bees are dancing"
            }
        },
        listener = object : PipelineListener {
            override fun onPlayable(song: SongEntity) { events += "playable:${song.status}" }
            override fun onReady(song: SongEntity) { events += "ready" }
            override fun onFailed(song: SongEntity) { events += "failed:${song.error}" }
            override fun onExportFailed(song: SongEntity, error: Exception) { events += "exportFailed" }
        },
        timing = PipelineTiming(sunoPollInterval = 5.milliseconds, sunoMaxWait = 5.seconds, lyricsPollInterval = 5.milliseconds),
    )

    private fun newSong(inputText: String? = null, url: String? = "https://example.com/bees") = SongEntity(
        id = "song-1", createdAt = 1, sourceUrl = url, sourceTitle = "example.com", sourceSite = "example.com",
        inputText = inputText, styleId = style.id, styleName = style.name, styleDescription = style.description,
    ).also { store.songs[it.id] = it }

    @Test
    fun articleBecomesADownloadedSong() = runBlocking {
        newSong()
        val statuses = mutableListOf<SongStatus>()
        pipeline { statuses += it.status }.run("song-1")

        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.READY)
        assertThat(song.error).isNull()
        assertThat(song.sourceTitle).isEqualTo("How bees dance") // Readability's title replaces the placeholder
        assertThat(song.sourceSite).isEqualTo("Science Daily")
        assertThat(song.lyrics).isEqualTo("[Verse]\nThe bees are dancing")
        assertThat(song.lyricsProvider).isEqualTo("anthropic")
        assertThat(song.styleTags).isEqualTo("Sunlit Indie Folk, Warm, 96 BPM")
        assertThat(song.sunoTaskId).isEqualTo("task-1")
        assertThat(song.title).isEqualTo("The Waggle Dance")
        assertThat(song.audioUrl).endsWith("/audio.mp3")
        assertThat(File(song.audioPath!!).readText()).endsWith("/audio.mp3")
        assertThat(File(song.imagePath!!).readText()).endsWith("/cover.jpg")
        assertThat(song.durationSec).isEqualTo(8.0)
        assertThat(song.exportedUri).isEqualTo("content://media/external/audio/media/7")
        assertThat(song.completedAt).isNotNull()

        assertThat(statuses.distinct()).containsAtLeast(
            SongStatus.READING, SongStatus.WRITING_LYRICS, SongStatus.COMPOSING, SongStatus.STREAMING,
            SongStatus.DOWNLOADING, SongStatus.READY,
        ).inOrder()
        // Playable exactly once, as soon as Suno streamed - before the final file existed.
        assertThat(events).containsExactly("playable:STREAMING", "export", "ready").inOrder()
    }

    @Test
    fun claudeGetsTheAddOnsPrompts() = runBlocking {
        newSong()
        pipeline().run("song-1")
        val article = "Honeybees dance. ".repeat(40)
        val (lyricsCall, tagsCall) = writerCalls
        assertThat(lyricsCall.first).isEqualTo(recipe.lyricsSystemPrompt)
        assertThat(lyricsCall.second).isEqualTo(recipe.lyricsPrompt(article, style))
        assertThat(lyricsCall.third).isEqualTo(Effort.HIGH)
        assertThat(tagsCall.first).isEqualTo(recipe.styleSystemPrompt)
        assertThat(tagsCall.second).isEqualTo(recipe.styleTagsPrompt("[Verse]\nThe bees are dancing", style))

        val generate = fake.requestsTo("/api/v1/generate").single().body!!.utf8()
        assertThat(generate).contains("\"style\":\"Sunlit Indie Folk, Warm, 96 BPM\"")
        assertThat(generate).contains("\"title\":\"How bees dance\"")
    }

    @Test
    fun withoutAnAnthropicKeySunoWritesTheLyrics() = runBlocking {
        anthropicKey = ""
        newSong()
        pipeline().run("song-1")
        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.READY)
        assertThat(song.lyricsProvider).isEqualTo("suno")
        assertThat(song.lyrics).isEqualTo(FakeApis.LYRICS)
        assertThat(song.styleTags).isEqualTo(recipe.fallbackStyleTags(style))
        val prompt = fake.requestsTo("/api/v1/lyrics").single().body!!.utf8()
        assertThat(prompt).contains("Style: Musical. A song about: Honeybees dance.")
        assertThat(writerCalls).isEmpty()
    }

    @Test
    fun highlightedTextSkipsTheWebPage() = runBlocking {
        newSong(inputText = "Sing exactly these words about bees and flowers")
        pipeline().run("song-1")
        assertThat(extractedUrls).isEmpty()
        assertThat(store.songs.getValue("song-1").articleText).isEqualTo("Sing exactly these words about bees and flowers")
        assertThat(writerCalls.first().second).contains("Sing exactly these words about bees and flowers")
    }

    @Test
    fun resumingNeverPaysSunoTwice() = runBlocking {
        newSong()
        store.songs["song-1"] = store.songs.getValue("song-1").copy(
            status = SongStatus.COMPOSING, articleText = "text", lyrics = "[Verse]\nla", styleTags = "pop", sunoTaskId = "task-1",
        )
        pipeline().run("song-1")
        assertThat(store.songs.getValue("song-1").status).isEqualTo(SongStatus.READY)
        assertThat(fake.requestsTo("/api/v1/generate")).isEmpty()
        assertThat(writerCalls).isEmpty()
        assertThat(extractedUrls).isEmpty()
    }

    @Test
    fun sunoFailureFailsTheSongAndForgetsTheTask() = runBlocking {
        fake.sunoStatuses = listOf("PENDING", "SENSITIVE_WORD_ERROR")
        fake.sunoErrorMessage = "Lyrics contain prohibited words"
        newSong()
        pipeline().run("song-1")
        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.FAILED)
        assertThat(song.error).contains("Lyrics contain prohibited words")
        assertThat(song.sunoTaskId).isNull() // a retry submits a fresh task
        assertThat(song.lyrics).isNotNull() // ...but keeps the lyrics
        assertThat(events.single()).startsWith("failed:")
    }

    @Test
    fun unreadablePageFailsWithTheExtractorsMessage() = runBlocking {
        extractor = { throw ArticleExtractionException("Couldn't find any article text on that page.") }
        newSong()
        pipeline().run("song-1")
        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.FAILED)
        assertThat(song.error).isEqualTo("Couldn't find any article text on that page.")
        assertThat(fake.requests).isEmpty()
    }

    @Test
    fun sunoApiErrorsReachTheUser() = runBlocking {
        fake.generateCode = 429
        newSong()
        pipeline().run("song-1")
        assertThat(store.songs.getValue("song-1").error).contains("insufficient SunoAPI credits")
    }

    @Test
    fun cancellingMidwayStopsWithoutOverwritingTheStatus() = runBlocking {
        newSong()
        pipeline { song ->
            // The user cancels while Claude is writing the lyrics.
            if (song.status == SongStatus.WRITING_LYRICS) store.songs[song.id] = song.copy(status = SongStatus.CANCELLED)
        }.run("song-1")
        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.CANCELLED)
        assertThat(fake.requestsTo("/api/v1/generate")).isEmpty()
        assertThat(events).isEmpty()
    }

    @Test
    fun aTimeoutInsideAStageFailsTheSongInsteadOfStrandingIt() = runBlocking {
        // withTimeout throws a CancellationException that is *not* the worker being stopped.
        extractor = { withTimeout(1.milliseconds) { delay(1_000) }; error("unreachable") }
        newSong()
        pipeline().run("song-1")
        assertThat(store.songs.getValue("song-1").status).isEqualTo(SongStatus.FAILED)
        assertThat(events.single()).startsWith("failed:")
    }

    @Test
    fun aRealStopLeavesTheSongActiveForTheNextRun() = runBlocking {
        newSong()
        lateinit var job: Job
        job = launch { pipeline { if (it.status == SongStatus.COMPOSING) job.cancel() }.run("song-1") } // WorkManager stops us
        job.join()
        assertThat(job.isCancelled).isTrue()
        assertThat(store.songs.getValue("song-1").status.isActive).isTrue() // resumes on the next run
        assertThat(events).isEmpty()
    }

    @Test
    fun aResumedSongShowsItsRealStageAndStaysPlayable() = runBlocking {
        newSong()
        store.songs["song-1"] = store.songs.getValue("song-1").copy(
            status = SongStatus.QUEUED, articleText = "text", lyrics = "[Verse]\nla", styleTags = "pop",
            sunoTaskId = "task-1", streamUrl = "https://cdn/stream",
        )
        fake.sunoStatuses = listOf("FIRST_SUCCESS", "SUCCESS")
        val statuses = mutableListOf<SongStatus>()
        pipeline { statuses += it.status }.run("song-1")
        assertThat(statuses.first()).isEqualTo(SongStatus.STREAMING) // not stuck at "Waiting to start"
        assertThat(events).doesNotContain("playable:STREAMING") // it was already announced before the retry
        assertThat(store.songs.getValue("song-1").status).isEqualTo(SongStatus.READY)
    }

    @Test
    fun cancellingDuringSubmitStillRemembersThePaidTask() = runBlocking {
        newSong()
        pipeline { song ->
            if (song.status == SongStatus.COMPOSING && song.sunoTaskId == null) store.songs[song.id] = song.copy(status = SongStatus.CANCELLED)
        }.run("song-1")
        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.CANCELLED)
        assertThat(song.sunoTaskId).isEqualTo("task-1") // a retry resumes this task instead of paying again
        assertThat(fake.requestsTo("/api/v1/generate/record-info")).isEmpty()
    }

    @Test
    fun deletingASongMidwayCleansUpItsFiles() = runBlocking {
        newSong()
        pipeline { song -> if (song.status == SongStatus.DOWNLOADING && song.audioPath != null) store.songs.remove(song.id) }.run("song-1")
        assertThat(store.songs).doesNotContainKey("song-1")
        assertThat(events).contains("discard")
        assertThat(events).doesNotContain("ready")
    }

    @Test
    fun finishedOrMissingSongsAreLeftAlone() = runBlocking {
        pipeline().run("nope")
        newSong()
        store.songs["song-1"] = store.songs.getValue("song-1").copy(status = SongStatus.READY)
        pipeline().run("song-1")
        assertThat(fake.requests).isEmpty()
        assertThat(extractedUrls).isEmpty()
    }

    @Test
    fun exportFailureStillLeavesAReadySong() = runBlocking {
        newSong()
        val failing = SongPipeline(
            store, { ExtractedArticle("t", "Honeybees dance. ".repeat(40), null) },
            SunoClient(OkHttpClient(), { fake.baseUrl }, { "k" }),
            object : SongDownloads {
                override suspend fun downloadAudio(id: String, url: String) = File(tmp, "a.mp3").apply { writeText("x") }
                override suspend fun downloadCover(id: String, url: String) = throw java.io.IOException("cover 404")
                override suspend fun exportToMusic(song: SongEntity): String = throw java.io.IOException("disk full")
                override fun discard(id: String) = Unit
            },
            recipe,
            { AppSettings("k", "", "V6", "", true, true, recipe.defaultStyles, null) },
            { null },
            object : PipelineListener {
                override fun onExportFailed(song: SongEntity, error: Exception) { events += "exportFailed:${error.message}" }
                override fun onReady(song: SongEntity) { events += "ready" }
            },
            PipelineTiming(5.milliseconds, 5.seconds, 5.milliseconds),
        )
        failing.run("song-1")
        val song = store.songs.getValue("song-1")
        assertThat(song.status).isEqualTo(SongStatus.READY)
        assertThat(song.imagePath).isNull() // cover is cosmetic; the remote image URL is kept
        assertThat(song.imageUrl).endsWith("/cover.jpg")
        assertThat(events).containsExactly("exportFailed:disk full", "ready").inOrder()
    }

    @Test
    fun styleTagsAreTrimmedToWholeTags() {
        val long = "Bluegrass Story-Song, Playful Wonder, Bouncy 2/4 Shuffle, Fingerpicked Banjo, Fiddle, Upright Bass, Warm Storyteller Vocals"
        assertThat(SongPipeline.trimStyleTags(long)).isEqualTo("Bluegrass Story-Song, Playful Wonder, Bouncy 2/4 Shuffle, Fingerpicked Banjo, Fiddle, Upright Bass")
        assertThat(SongPipeline.trimStyleTags("  Lo-Fi, Warm  ")).isEqualTo("Lo-Fi, Warm")
        assertThat(SongPipeline.trimStyleTags("x".repeat(200))).hasLength(120)
    }

    @Test
    fun userMessagesAreReadable() {
        assertThat(SongPipeline.userMessage(java.io.IOException("timeout"))).isEqualTo("Network problem: timeout")
        assertThat(SongPipeline.userMessage(ArticleExtractionException("No text"))).isEqualTo("No text")
    }

    /** In-memory [SongStore] with the same atomic update semantics as the Room repository. */
    class FakeStore : SongStore {
        val songs = mutableMapOf<String, SongEntity>()
        var onUpdate: ((SongEntity) -> Unit)? = null
        private val mutex = Mutex()

        override suspend fun get(id: String) = mutex.withLock { songs[id] }

        override suspend fun update(id: String, transform: (SongEntity) -> SongEntity): SongEntity {
            val updated = mutex.withLock {
                val current = songs[id] ?: throw SongMissingException(id)
                transform(current).also { songs[id] = it }
            }
            onUpdate?.invoke(updated)
            return songs[id] ?: updated
        }
    }
}

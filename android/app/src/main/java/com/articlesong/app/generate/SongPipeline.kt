package com.articlesong.app.generate

import android.util.Log
import com.anthropic.errors.AnthropicException
import com.articlesong.app.api.ClaudeException
import com.articlesong.app.api.Effort
import com.articlesong.app.api.LyricsWriter
import com.articlesong.app.api.SunoApiException
import com.articlesong.app.api.SunoClient
import com.articlesong.app.api.SunoGenerationFailed
import com.articlesong.app.data.AppSettings
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongMissingException
import com.articlesong.app.data.SongStatus
import com.articlesong.app.data.SongStore
import com.articlesong.app.extract.ArticleExtractionException
import com.articlesong.app.extract.ArticleExtractor
import com.articlesong.app.recipe.SongRecipe
import com.articlesong.app.recipe.SongStyle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeSource

/** Side effects of generation that live outside the pipeline: autoplay, notifications. */
interface PipelineListener {
    /** First playable audio exists (Suno's live stream, or the final file). */
    fun onPlayable(song: SongEntity) {}
    fun onReady(song: SongEntity) {}
    fun onFailed(song: SongEntity) {}
    fun onExportFailed(song: SongEntity, error: Exception) {}
}

/** File operations the pipeline needs (lets tests run without Android storage). */
interface SongDownloads {
    suspend fun downloadAudio(id: String, url: String): File
    suspend fun downloadCover(id: String, url: String): File
    suspend fun exportToMusic(song: SongEntity): String
    /** Remove anything downloaded for a song that was deleted mid-generation. */
    fun discard(id: String)
}

data class PipelineTiming(
    val sunoPollInterval: Duration = 5.seconds,
    val sunoMaxWait: Duration = 8.minutes,
    val lyricsPollInterval: Duration = 3.seconds,
    val lyricsMaxWait: Duration = 2.minutes,
)

/** Thrown when the song was cancelled or deleted while we worked on it. */
private class SongStopped : Exception()

/**
 * Article -> lyrics -> style tags -> Suno -> stream -> download, the same flow as the add-on's
 * generateSongFromArticle(). Every stage writes its output before the next starts and is
 * skipped when that output already exists, so [run] resumes a song after the process dies.
 */
class SongPipeline(
    private val store: SongStore,
    private val extractor: ArticleExtractor,
    private val suno: SunoClient,
    private val downloads: SongDownloads,
    private val recipe: SongRecipe,
    private val settings: suspend () -> AppSettings,
    /** Claude when an Anthropic key is set; null means "let Suno write the lyrics". */
    private val lyricsWriter: (AppSettings) -> LyricsWriter?,
    private val listener: PipelineListener,
    private val timing: PipelineTiming = PipelineTiming(),
) {
    suspend fun run(id: String) {
        val start = store.get(id) ?: return
        if (!start.status.isActive) return
        val config = settings()
        val writer = lyricsWriter(config)
        try {
            var song = readArticle(start)
            song = writeLyrics(song, writer)
            song = writeStyleTags(song, writer)
            song = submitToSuno(song, config)
            song = awaitAudio(song)
            song = download(song)
            finish(song, config)
        } catch (e: CancellationException) {
            // Worker stopped: the song stays active and resumes on the next run. Any other
            // CancellationException (a timeout inside a stage) is an ordinary failure.
            if (!currentCoroutineContext().isActive) throw e
            fail(id, e)
        } catch (_: SongStopped) {
        } catch (_: SongMissingException) {
            downloads.discard(id)
        } catch (e: Exception) {
            fail(id, e)
        }
    }

    private suspend fun readArticle(song: SongEntity): SongEntity {
        if (song.articleText != null) return song
        song.inputText?.let { text -> return advance(song.id) { it.copy(articleText = text) } }
        val url = song.sourceUrl ?: throw ArticleExtractionException("Nothing to sing: no link or text")
        advance(song.id) { it.copy(status = SongStatus.READING) }
        val article = extractor.extract(url)
        return advance(song.id) {
            it.copy(
                articleText = article.text,
                sourceTitle = article.title.ifBlank { it.sourceTitle },
                sourceSite = article.siteName ?: it.sourceSite,
            )
        }
    }

    private suspend fun writeLyrics(song: SongEntity, writer: LyricsWriter?): SongEntity {
        if (song.lyrics != null) return song
        advance(song.id) { it.copy(status = SongStatus.WRITING_LYRICS) }
        val article = song.articleText!!
        val (lyrics, provider) = if (writer != null) {
            writer.complete(recipe.lyricsSystemPrompt, recipe.lyricsPrompt(article, song.style), LYRICS_MAX_TOKENS, Effort.HIGH) to "anthropic"
        } else {
            sunoLyrics(recipe.sunoLyricsPrompt(article, song.style)) to "suno"
        }
        return advance(song.id) { it.copy(lyrics = lyrics, lyricsProvider = provider) }
    }

    private suspend fun sunoLyrics(prompt: String): String {
        val taskId = suno.generateLyrics(prompt)
        val clock = TimeSource.Monotonic.markNow()
        while (clock.elapsedNow() < timing.lyricsMaxWait) {
            delay(timing.lyricsPollInterval)
            val task = suno.lyricsRecordInfo(taskId)
            if (task.isFailed) throw SunoGenerationFailed("SunoAPI lyrics generation failed: ${task.errorMessage ?: task.status}")
            if (task.status == "SUCCESS") {
                return task.text ?: throw SunoGenerationFailed("SunoAPI returned SUCCESS but no lyrics")
            }
        }
        throw SunoGenerationFailed("SunoAPI lyrics generation timed out")
    }

    private suspend fun writeStyleTags(song: SongEntity, writer: LyricsWriter?): SongEntity {
        if (song.styleTags != null) return song
        advance(song.id) { it.copy(status = SongStatus.WRITING_LYRICS) }
        val tags = if (writer != null) {
            trimStyleTags(writer.complete(recipe.styleSystemPrompt, recipe.styleTagsPrompt(song.lyrics!!, song.style), STYLE_MAX_TOKENS, Effort.LOW))
        } else {
            recipe.fallbackStyleTags(song.style)
        }
        return advance(song.id) { it.copy(styleTags = tags) }
    }

    private suspend fun submitToSuno(song: SongEntity, config: AppSettings): SongEntity {
        if (song.sunoTaskId != null) return song
        advance(song.id) { it.copy(status = SongStatus.COMPOSING) }
        // Suno charges on submit, so finish the request and remember the task id even if the user
        // cancels or the worker is stopped meanwhile: a later retry resumes it instead of paying again.
        val taskId = withContext(NonCancellable) {
            suno.generate(config.sunoModel, song.lyrics!!, song.styleTags!!, song.sourceTitle).also { taskId ->
                store.update(song.id) { it.copy(sunoTaskId = taskId, sunoModel = config.sunoModel) }
            }
        }
        return advance(song.id) { it.copy(sunoTaskId = taskId) }
    }

    private suspend fun awaitAudio(start: SongEntity): SongEntity {
        if (start.audioUrl != null) return start
        var announced = start.streamUrl != null
        // A resumed song (retry, worker rerun) shows where it really is, and stays playable if it was.
        var song = advance(start.id) { it.copy(status = if (announced) SongStatus.STREAMING else SongStatus.COMPOSING) }
        val clock = TimeSource.Monotonic.markNow()
        while (clock.elapsedNow() < timing.sunoMaxWait) {
            val task = suno.recordInfo(song.sunoTaskId!!)
            if (task.isFailed) {
                // Suno gave up on this task: forget it so a retry submits a fresh one.
                advance(song.id) { it.copy(sunoTaskId = null, streamUrl = null) }
                throw SunoGenerationFailed("Suno couldn't make this song: ${task.errorMessage ?: task.status}")
            }
            val track = task.tracks.firstOrNull()
            if (task.isComplete) {
                val audioUrl = track?.audioUrl ?: throw SunoGenerationFailed("Suno finished but returned no audio")
                song = advance(song.id) {
                    it.copy(
                        status = SongStatus.DOWNLOADING,
                        audioUrl = audioUrl,
                        streamUrl = it.streamUrl ?: track.streamUrl,
                        imageUrl = track.imageUrl ?: it.imageUrl,
                        title = track.title ?: it.title,
                        durationSec = track.durationSec ?: it.durationSec,
                    )
                }
                if (!announced) listener.onPlayable(song)
                return song
            }
            if (!announced && track?.playUrl != null) {
                // Start listening while Suno finishes the full-quality file.
                song = advance(song.id) {
                    it.copy(
                        status = SongStatus.STREAMING,
                        streamUrl = track.playUrl,
                        imageUrl = track.imageUrl,
                        title = track.title,
                        durationSec = track.durationSec,
                    )
                }
                announced = true
                listener.onPlayable(song)
            }
            delay(timing.sunoPollInterval)
        }
        throw SunoGenerationFailed("Suno is taking longer than ${timing.sunoMaxWait.inWholeMinutes} minutes. Retry to keep waiting.")
    }

    private suspend fun download(song: SongEntity): SongEntity {
        if (song.audioPath != null) return song
        advance(song.id) { it.copy(status = SongStatus.DOWNLOADING) }
        val audio = downloads.downloadAudio(song.id, song.audioUrl!!)
        val cover = song.imageUrl?.let { url ->
            try {
                downloads.downloadCover(song.id, url)
            } catch (e: IOException) {
                Log.w(TAG, "Cover download failed for ${song.id}; keeping the remote image", e)
                null
            }
        }
        return advance(song.id) { it.copy(audioPath = audio.absolutePath, imagePath = cover?.absolutePath) }
    }

    private suspend fun finish(start: SongEntity, config: AppSettings) {
        var song = advance(start.id) { it.copy(status = SongStatus.READY, completedAt = System.currentTimeMillis()) }
        if (config.saveToMusic && song.exportedUri == null) {
            try {
                val uri = downloads.exportToMusic(song)
                song = store.update(song.id) { it.copy(exportedUri = uri) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Log.e(TAG, "Couldn't copy ${song.id} to Music", e)
                listener.onExportFailed(song, e)
            }
        }
        listener.onReady(song)
    }

    private suspend fun fail(id: String, error: Exception) {
        Log.e(TAG, "Song $id failed", error)
        val failed = try {
            store.update(id) { if (it.status.isActive) it.copy(status = SongStatus.FAILED, error = userMessage(error)) else it }
        } catch (_: SongMissingException) {
            return
        }
        if (failed.status == SongStatus.FAILED) listener.onFailed(failed)
    }

    /** Persist a stage's output, unless the user cancelled or deleted the song meanwhile. */
    private suspend fun advance(id: String, transform: (SongEntity) -> SongEntity): SongEntity {
        var stopped = false
        val updated = store.update(id) { current ->
            if (!current.status.isActive) current.also { stopped = true } else transform(current)
        }
        if (stopped) throw SongStopped()
        return updated
    }

    private val SongEntity.style get() = SongStyle(styleId, styleName, styleDescription)

    companion object {
        private const val TAG = "SongPipeline"
        // Same budgets as the add-on
        const val LYRICS_MAX_TOKENS = 16_000L
        const val STYLE_MAX_TOKENS = 8_000L
        const val STYLE_TAGS_MAX_CHARS = 120

        /** Same 120-char budget as the add-on, but cut after the last whole tag instead of mid-word. */
        fun trimStyleTags(tags: String): String {
            val clean = tags.trim()
            if (clean.length <= STYLE_TAGS_MAX_CHARS) return clean
            val cut = clean.take(STYLE_TAGS_MAX_CHARS)
            val lastComma = cut.lastIndexOf(',')
            return (if (lastComma > 0) cut.take(lastComma) else cut).trim()
        }

        fun userMessage(error: Exception): String = when (error) {
            is ArticleExtractionException, is SunoApiException, is SunoGenerationFailed, is ClaudeException ->
                error.message.orEmpty()
            is AnthropicException -> "Claude API error: ${error.message}"
            is IOException -> "Network problem: ${error.message ?: "connection failed"}"
            else -> error.message ?: error::class.java.simpleName
        }
    }
}

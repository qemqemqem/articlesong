package com.articlesong.app.generate

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongFiles
import com.articlesong.app.data.SongRepository
import com.articlesong.app.data.SongStatus
import com.articlesong.app.recipe.SongStyle
import com.articlesong.app.share.ShareParser
import com.articlesong.app.share.SongSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Creates songs and drives their background work (start, cancel, retry, delete). */
class SongScheduler(
    private val context: Context,
    private val songs: SongRepository,
    private val files: SongFiles,
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun create(source: SongSource, style: SongStyle, id: String = UUID.randomUUID().toString()): SongEntity {
        val url = when (source) {
            is SongSource.WebPage -> source.url
            is SongSource.Text -> source.url
        }
        val song = SongEntity(
            id = id,
            createdAt = now(),
            sourceUrl = url,
            sourceTitle = source.titleHint ?: placeholderTitle(source),
            sourceSite = ShareParser.siteName(url),
            inputText = (source as? SongSource.Text)?.text,
            styleId = style.id,
            styleName = style.name,
            styleDescription = style.description,
        )
        songs.insert(song)
        enqueue(song.id)
        return song
    }

    /** Same article, new style: reuses the extracted text so we skip straight to lyrics. */
    suspend fun regenerate(original: SongEntity, style: SongStyle): SongEntity {
        val song = SongEntity(
            id = UUID.randomUUID().toString(),
            createdAt = now(),
            sourceUrl = original.sourceUrl,
            sourceTitle = original.sourceTitle,
            sourceSite = original.sourceSite,
            inputText = original.inputText,
            articleText = original.articleText,
            styleId = style.id,
            styleName = style.name,
            styleDescription = style.description,
        )
        songs.insert(song)
        enqueue(song.id)
        return song
    }

    suspend fun cancel(id: String) {
        songs.update(id) { if (it.status.isActive) it.copy(status = SongStatus.CANCELLED, error = "Cancelled") else it }
        WorkManager.getInstance(context).cancelUniqueWork(workName(id))
    }

    suspend fun retry(id: String) {
        songs.update(id) { it.copy(status = SongStatus.QUEUED, error = null) }
        enqueue(id)
    }

    suspend fun delete(id: String) {
        WorkManager.getInstance(context).cancelUniqueWork(workName(id))
        songs.delete(id)
        withContext(Dispatchers.IO) { files.deleteFiles(id) }
    }

    fun enqueue(id: String) {
        val request = OneTimeWorkRequestBuilder<SongWorker>()
            .setInputData(workDataOf(SongWorker.KEY_SONG_ID to id))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(workName(id), ExistingWorkPolicy.KEEP, request)
    }

    companion object {
        const val TAG = "song"

        fun workName(id: String) = "song-$id"

        fun placeholderTitle(source: SongSource): String = when (source) {
            is SongSource.WebPage -> pdfName(source.url) ?: ShareParser.siteName(source.url) ?: source.url
            is SongSource.Text -> source.text.split(Regex("\\s+")).filter { it.isNotEmpty() }.let { words ->
                words.take(8).joinToString(" ") + if (words.size > 8) "…" else ""
            }
        }

        /** "attention_is-all.pdf" -> "attention is all": a better placeholder than the site for PDFs. */
        private fun pdfName(url: String): String? = url.toHttpUrlOrNull()?.pathSegments?.lastOrNull()
            ?.takeIf { it.endsWith(".pdf", ignoreCase = true) }
            ?.dropLast(4)?.replace('_', ' ')?.replace('-', ' ')
    }
}

package com.articlesong.app.data

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.articlesong.app.api.await
import com.articlesong.app.generate.SongDownloads
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException

/** Where downloaded songs and covers live, plus copying a song into the shared Music folder. */
class SongFiles(
    private val context: Context,
    private val http: OkHttpClient,
) : SongDownloads {
    private val songsDir get() = File(context.filesDir, "songs").apply { mkdirs() }
    private val coversDir get() = File(context.filesDir, "covers").apply { mkdirs() }

    fun audioFile(id: String) = File(songsDir, "$id.mp3")
    fun coverFile(id: String) = File(coversDir, "$id.jpg")

    /** Downloads to a .part file first so a half-written file is never mistaken for a song. */
    suspend fun download(url: String, dest: File): File {
        val response = http.newCall(Request.Builder().url(url).build()).await()
        return withContext(Dispatchers.IO) {
            response.use {
                if (!it.isSuccessful) throw IOException("Download failed (HTTP ${it.code})")
                val part = File(dest.parentFile, dest.name + ".part")
                part.outputStream().use { out -> it.body.byteStream().copyTo(out) }
                if (!part.renameTo(dest)) throw IOException("Couldn't save ${dest.name}")
            }
            dest
        }
    }

    override suspend fun downloadAudio(id: String, url: String): File = download(url, audioFile(id))

    override suspend fun downloadCover(id: String, url: String): File = download(url, coverFile(id))

    override suspend fun exportToMusic(song: SongEntity): String = exportAudio(song).toString()

    override fun discard(id: String) = deleteFiles(id)

    fun deleteFiles(id: String) {
        listOf(audioFile(id), coverFile(id)).forEach { file ->
            file.delete()
            File(file.parentFile, file.name + ".part").delete()
        }
    }

    /** Copies the song into Music/ArticleSong so other players and the Files app can see it. */
    suspend fun exportAudio(song: SongEntity): Uri = withContext(Dispatchers.IO) {
        val source = song.audioPath?.let(::File)?.takeIf { it.exists() }
            ?: throw IOException("Song isn't downloaded yet")
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, "${safeFileName(song.displayTitle)}.mp3")
            put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
            put(MediaStore.Audio.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/ArticleSong")
            put(MediaStore.Audio.Media.TITLE, song.displayTitle)
            put(MediaStore.Audio.Media.ARTIST, "ArticleSong")
            put(MediaStore.Audio.Media.ALBUM, "ArticleSong")
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values) ?: throw IOException("Couldn't create a file in Music")
        try {
            resolver.openOutputStream(uri)!!.use { out -> source.inputStream().use { it.copyTo(out) } }
            resolver.update(uri, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
            uri
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
    }

    /** content:// URI other apps can read, for the share sheet. */
    fun shareUri(song: SongEntity): Uri {
        val file = song.audioPath?.let(::File)?.takeIf { it.exists() } ?: throw IOException("Song isn't downloaded yet")
        return FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    }

    companion object {
        fun safeFileName(title: String): String =
            title.replace(Regex("""[\\/:*?"<>|\u0000-\u001f]"""), "_").trim().take(80).ifEmpty { "ArticleSong" }
    }
}

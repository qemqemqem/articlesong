package com.articlesong.app

import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.articlesong.app.data.SongDatabase
import com.articlesong.app.data.SongEntity
import com.articlesong.app.data.SongFiles
import com.articlesong.app.data.SongMissingException
import com.articlesong.app.data.SongRepository
import com.articlesong.app.data.SongStatus
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SongStorageTest {
    private val db = SongDatabase.inMemory(TestApp.app)
    private val repo = SongRepository(db)
    private val fake = FakeApis()

    @Before fun start() { fake.start() }
    @After fun stop() { db.close(); fake.close() }

    private fun song(id: String, createdAt: Long, status: SongStatus = SongStatus.READY) = SongEntity(
        id = id, createdAt = createdAt, sourceUrl = "https://example.com/$id", sourceTitle = "Title $id", sourceSite = "example.com",
        articleText = "long text ".repeat(1000), styleId = "pop", styleName = "Pop", styleDescription = "Catchy", status = status,
    )

    @Test
    fun summariesAreNewestFirstAndSkipBigColumns() = runBlocking {
        repo.insert(song("a", 1))
        repo.insert(song("b", 2))
        assertThat(repo.summaries.first().map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun updatesAreAtomicAndStampUpdatedAt() = runBlocking {
        repo.insert(song("a", 1))
        val updated = repo.update("a") { it.copy(status = SongStatus.COMPOSING, sunoTaskId = "t") }
        assertThat(updated.updatedAt).isGreaterThan(1)
        assertThat(repo.get("a")!!.sunoTaskId).isEqualTo("t")
        assertThat(repo.active().map { it.id }).containsExactly("a")
        assertThrows(SongMissingException::class.java) { runBlocking { repo.update("zzz") { it } } }
        Unit
    }

    @Test
    fun favoritesAndPlayCounts() = runBlocking {
        repo.insert(song("a", 1))
        repo.toggleFavorite("a")
        repo.recordPlay("a")
        repo.recordPlay("a")
        val a = repo.get("a")!!
        assertThat(a.favorite).isTrue()
        assertThat(a.playCount).isEqualTo(2)
        assertThat(a.lastPlayedAt).isNotNull()
        // A song deleted while still queued in the player must not crash the play counter.
        repo.recordPlay("deleted-song")
    }

    @Test
    fun downloadsExportsAndShares() = runBlocking {
        val files = SongFiles(TestApp.app, OkHttpClient())
        val audio = files.downloadAudio("test-song", fake.baseUrl.resolve("audio.mp3").toString())
        assertThat(audio.readBytes()).isEqualTo(fake.audioBytes)
        assertThat(File(audio.parentFile, "test-song.mp3.part").exists()).isFalse()

        val entity = song("test-song", 1).copy(title = "Waggle: The \"Dance\"", audioPath = audio.absolutePath)
        val uri = files.exportAudio(entity)
        val resolver = TestApp.app.contentResolver
        resolver.query(uri, arrayOf(MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.RELATIVE_PATH), null, null, null)!!.use {
            assertThat(it.moveToFirst()).isTrue()
            assertThat(it.getString(0)).startsWith("Waggle_ The _Dance_")
            assertThat(it.getString(1)).isEqualTo("Music/ArticleSong/")
        }
        assertThat(resolver.openInputStream(uri)!!.use { it.readBytes() }).isEqualTo(fake.audioBytes)
        resolver.delete(uri, null, null)

        assertThat(files.shareUri(entity).authority).isEqualTo("${TestApp.app.packageName}.files")
        files.deleteFiles("test-song")
        assertThat(audio.exists()).isFalse()
    }

    @Test
    fun failedDownloadsLeaveNoFile() {
        val files = SongFiles(TestApp.app, OkHttpClient())
        assertThrows(java.io.IOException::class.java) {
            runBlocking { files.downloadAudio("nope", fake.baseUrl.resolve("does-not-exist.mp3").toString()) }
        }
        assertThat(files.audioFile("nope").exists()).isFalse()
    }
}

package com.articlesong.app.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow

class SongMissingException(id: String) : IllegalStateException("Song $id no longer exists")

/** The slice of storage the generation pipeline needs (lets tests run it without Room). */
interface SongStore {
    suspend fun get(id: String): SongEntity?

    /** Atomic read-modify-write. Throws [SongMissingException] if the song was deleted. */
    suspend fun update(id: String, transform: (SongEntity) -> SongEntity): SongEntity
}

class SongRepository(
    private val db: SongDatabase,
    private val now: () -> Long = System::currentTimeMillis,
) : SongStore {
    private val dao = db.songs()

    val summaries: Flow<List<SongSummary>> = dao.observeSummaries()

    fun observe(id: String): Flow<SongEntity?> = dao.observe(id)

    override suspend fun get(id: String): SongEntity? = dao.get(id)

    suspend fun insert(song: SongEntity) = dao.insert(song)

    override suspend fun update(id: String, transform: (SongEntity) -> SongEntity): SongEntity =
        db.withTransaction {
            val current = dao.get(id) ?: throw SongMissingException(id)
            transform(current).copy(updatedAt = now()).also { dao.update(it) }
        }

    suspend fun delete(id: String) = dao.delete(id)

    suspend fun active(): List<SongEntity> = dao.withStatus(SongStatus.ACTIVE.toList())

    suspend fun toggleFavorite(id: String) = update(id) { it.copy(favorite = !it.favorite) }

    /** Counts a play. A song deleted while still queued in the player is simply not counted. */
    suspend fun recordPlay(id: String) {
        try {
            update(id) { it.copy(playCount = it.playCount + 1, lastPlayedAt = now()) }
        } catch (_: SongMissingException) {
        }
    }
}

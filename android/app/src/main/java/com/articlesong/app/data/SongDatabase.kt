package com.articlesong.app.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

private const val SUMMARY_COLUMNS = """id, createdAt, completedAt, sourceUrl, sourceTitle, sourceSite, styleId, styleName,
    status, error, title, streamUrl, audioUrl, imageUrl, audioPath, imagePath, durationSec, favorite, playCount, lastPlayedAt"""

@Dao
interface SongDao {
    @Query("SELECT $SUMMARY_COLUMNS FROM songs ORDER BY createdAt DESC")
    fun observeSummaries(): Flow<List<SongSummary>>

    @Query("SELECT * FROM songs WHERE id = :id")
    fun observe(id: String): Flow<SongEntity?>

    @Query("SELECT * FROM songs WHERE id = :id")
    suspend fun get(id: String): SongEntity?

    @Query("SELECT * FROM songs WHERE status IN (:statuses) ORDER BY createdAt")
    suspend fun withStatus(statuses: List<SongStatus>): List<SongEntity>

    @Insert
    suspend fun insert(song: SongEntity)

    @Update
    suspend fun update(song: SongEntity)

    @Query("DELETE FROM songs WHERE id = :id")
    suspend fun delete(id: String)
}

@Database(entities = [SongEntity::class], version = 1, exportSchema = true)
abstract class SongDatabase : RoomDatabase() {
    abstract fun songs(): SongDao

    companion object {
        fun build(context: Context): SongDatabase =
            Room.databaseBuilder(context, SongDatabase::class.java, "songs.db").build()

        fun inMemory(context: Context): SongDatabase =
            Room.inMemoryDatabaseBuilder(context, SongDatabase::class.java).build()
    }
}

package com.articlesong.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.io.File

/**
 * Lifecycle of one generated song. Each active status is resumable: the pipeline persists
 * every stage's output, so a killed worker picks up where it stopped (and never pays Suno twice).
 */
enum class SongStatus {
    QUEUED, READING, WRITING_LYRICS, COMPOSING, STREAMING, DOWNLOADING, READY, FAILED, CANCELLED;

    val isActive: Boolean get() = this in ACTIVE
    val isPlayable: Boolean get() = this == STREAMING || this == DOWNLOADING || this == READY

    /** 0 Reading, 1 Lyrics, 2 Music, 3 Done - for the progress stepper. */
    val stage: Int
        get() = when (this) {
            QUEUED, READING -> 0
            WRITING_LYRICS -> 1
            COMPOSING, STREAMING, DOWNLOADING -> 2
            READY, FAILED, CANCELLED -> 3
        }

    companion object {
        val ACTIVE = setOf(QUEUED, READING, WRITING_LYRICS, COMPOSING, STREAMING, DOWNLOADING)
    }
}

@Entity(tableName = "songs")
data class SongEntity(
    @PrimaryKey val id: String,
    val createdAt: Long,
    val updatedAt: Long = createdAt,
    val completedAt: Long? = null,

    // Where it came from
    val sourceUrl: String?,
    val sourceTitle: String,
    val sourceSite: String?,
    /** Text the user selected/shared; when set, we sing it instead of reading [sourceUrl]. */
    val inputText: String? = null,
    val articleText: String? = null,

    // How it should sound
    val styleId: String,
    val styleName: String,
    val styleDescription: String,

    // Pipeline state and outputs
    val status: SongStatus = SongStatus.QUEUED,
    val error: String? = null,
    val lyricsProvider: String? = null,
    val lyrics: String? = null,
    val styleTags: String? = null,
    val sunoModel: String? = null,
    val sunoTaskId: String? = null,
    val title: String? = null,
    val streamUrl: String? = null,
    val audioUrl: String? = null,
    val imageUrl: String? = null,
    val audioPath: String? = null,
    val imagePath: String? = null,
    val durationSec: Double? = null,
    val exportedUri: String? = null,

    // Library
    val favorite: Boolean = false,
    val playCount: Int = 0,
    val lastPlayedAt: Long? = null,
) {
    val displayTitle: String get() = title?.takeIf { it.isNotBlank() } ?: sourceTitle

    /** Best thing to play right now: the downloaded file, else Suno's final URL, else the live stream. */
    val playUri: String?
        get() = audioPath?.let { File(it) }?.takeIf { it.exists() }?.toURI()?.toString()
            ?: audioUrl ?: streamUrl

    val artworkUri: String?
        get() = imagePath?.let { File(it) }?.takeIf { it.exists() }?.toURI()?.toString() ?: imageUrl
}

/** List-row projection: everything except the large text columns. */
data class SongSummary(
    val id: String,
    val createdAt: Long,
    val completedAt: Long?,
    val sourceUrl: String?,
    val sourceTitle: String,
    val sourceSite: String?,
    val styleId: String,
    val styleName: String,
    val status: SongStatus,
    val error: String?,
    val title: String?,
    val streamUrl: String?,
    val audioUrl: String?,
    val imageUrl: String?,
    val audioPath: String?,
    val imagePath: String?,
    val durationSec: Double?,
    val favorite: Boolean,
    val playCount: Int,
    val lastPlayedAt: Long?,
) {
    val displayTitle: String get() = title?.takeIf { it.isNotBlank() } ?: sourceTitle
    val artworkModel: Any? get() = imagePath?.let { File(it) }?.takeIf { it.exists() } ?: imageUrl
    val isDownloaded: Boolean get() = audioPath != null
}

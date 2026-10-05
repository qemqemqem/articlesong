package com.articlesong.app.ui

import com.articlesong.app.data.SettingsStore
import com.articlesong.app.data.SongFiles
import com.articlesong.app.data.SongStatus
import com.articlesong.app.generate.SongScheduler
import com.articlesong.app.share.SongSource
import com.articlesong.app.ui.components.formatDuration
import com.articlesong.app.ui.components.formatMs
import com.articlesong.app.ui.components.relativeTime
import com.articlesong.app.ui.player.LyricsLine
import com.articlesong.app.ui.player.parseLyrics
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SmallLogicTest {
    @Test
    fun lyricsSplitIntoSectionsAndLines() {
        val lines = parseLyrics("[Verse]\nOne\nTwo\n\n\n[Chorus]\nThree\n\n")
        assertThat(lines).containsExactly(
            LyricsLine.Section("Verse"), LyricsLine.Line("One"), LyricsLine.Line("Two"),
            LyricsLine.Break, LyricsLine.Section("Chorus"), LyricsLine.Line("Three"),
        ).inOrder()
    }

    @Test
    fun styleIdsMatchTheAddOnsGenerator() {
        assertThat(SettingsStore.styleIdFromName("Sea Shanty!")).isEqualTo("sea_shanty")
        assertThat(SettingsStore.styleIdFromName("  Lo-Fi  Beats ")).isEqualTo("lo_fi_beats")
    }

    @Test
    fun fileNamesAreSafe() {
        assertThat(SongFiles.safeFileName("AC/DC: \"Live\"?")).isEqualTo("AC_DC_ _Live__")
        assertThat(SongFiles.safeFileName("   ")).isEqualTo("ArticleSong")
        assertThat(SongFiles.safeFileName("x".repeat(200))).hasLength(80)
    }

    @Test
    fun placeholderTitles() {
        assertThat(SongScheduler.placeholderTitle(SongSource.WebPage("https://www.wired.com/story/bees", null))).isEqualTo("wired.com")
        assertThat(SongScheduler.placeholderTitle(SongSource.WebPage("https://arxiv.org/files/attention_is-all.pdf", null))).isEqualTo("attention is all")
        assertThat(SongScheduler.placeholderTitle(SongSource.Text("one two three four five six seven eight nine ten", null, null)))
            .isEqualTo("one two three four five six seven eight…")
    }

    @Test
    fun durations() {
        assertThat(formatMs(0)).isEqualTo("0:00")
        assertThat(formatMs(185_400)).isEqualTo("3:05")
        assertThat(formatDuration(61.9)).isEqualTo("1:01")
        assertThat(formatDuration(null)).isEmpty()
        assertThat(relativeTime(1_000, now = 1_000 + 5 * 60_000)).isEqualTo("5m ago")
    }

    @Test
    fun statusStagesDriveTheStepper() {
        assertThat(SongStatus.READING.stage).isEqualTo(0)
        assertThat(SongStatus.WRITING_LYRICS.stage).isEqualTo(1)
        assertThat(SongStatus.STREAMING.stage).isEqualTo(2)
        assertThat(SongStatus.STREAMING.isPlayable).isTrue()
        assertThat(SongStatus.COMPOSING.isPlayable).isFalse()
        assertThat(SongStatus.FAILED.isActive).isFalse()
    }
}

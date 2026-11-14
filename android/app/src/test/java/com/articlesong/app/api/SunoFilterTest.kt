package com.articlesong.app.api

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Same cases as the add-on's tests/rejection.test.js, so both apps read Suno the same way. */
class SunoFilterTest {
    private val ninetyThree =
        "Your lyrics contain producer tag ninetythree - we don't reference specific artists on Our, please change your lyrics and try again."

    @Test
    fun recognisesContentRejections() {
        assertThat(SunoFilter.isRejection("SENSITIVE_WORD_ERROR", null)).isTrue()
        assertThat(SunoFilter.isRejection("GENERATE_AUDIO_FAILED", ninetyThree)).isTrue()
        assertThat(SunoFilter.isRejection(null, "Your lyrics contain copyrighted material. Please change it and try again.")).isTrue()
        assertThat(SunoFilter.isRejection(null, "Your tags contain artist name skank")).isTrue()
        assertThat(SunoFilter.isRejection("GENERATE_AUDIO_FAILED", "audio generation failed")).isFalse()
        assertThat(SunoFilter.isRejection("FAILED", null)).isFalse()
    }

    @Test
    fun readsTheWordsSunoNames() {
        assertThat(SunoFilter.flaggedWords(ninetyThree)).containsExactly("ninetythree")
        assertThat(SunoFilter.flaggedWords("Your tags contain artist name skank")).containsExactly("skank")
        assertThat(SunoFilter.flaggedWords("Your lyrics contain the word \"Taylor Swift\", which is not allowed")).containsExactly("taylor swift")
        assertThat(SunoFilter.flaggedWords("SENSITIVE_WORD_ERROR")).isEmpty()
        assertThat(SunoFilter.flaggedWords("Your lyrics contain copyrighted material.")).isEmpty()
    }

    @Test
    fun scrubsEverySpellingOfAWord() {
        val scrubbed = SunoFilter.scrub("Ninety-Three bees and ninety three more, NINETYTHREE!", listOf("ninetythree"))
        assertThat(scrubbed.lowercase()).doesNotContain("ninety")
        assertThat(scrubbed).isEqualTo("bees and more,!") // exactly what the add-on's scrubWords gives
    }

    @Test
    fun scrubKeepsLinesAndTagsTidy() {
        val lyrics = "[Verse]\nIn nineteen ninety-three, a doctor came\n  ninetythree  \n[Chorus]\nla"
        assertThat(SunoFilter.scrub(lyrics, listOf("ninetythree"))).isEqualTo("[Verse]\nIn nineteen, a doctor came\n\n[Chorus]\nla")
        assertThat(SunoFilter.scrub("Ska Punk, Skank Rhythm", listOf("skank"))).isEqualTo("Ska Punk, Rhythm")
        assertThat(SunoFilter.scrub("a (b) c", listOf("(b)"))).isEqualTo("a c") // regex characters are literal
    }
}

package com.articlesong.app.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareParserTest {
    @Test
    fun chromeShareIsAUrlWithTitleSubject() {
        val source = ShareParser.parseShare("https://www.nature.com/articles/bees-123", "How bees dance - Nature")
        assertThat(source).isEqualTo(SongSource.WebPage("https://www.nature.com/articles/bees-123", "How bees dance - Nature"))
    }

    @Test
    fun titleAndUrlInTheTextBody() {
        val source = ShareParser.parseShare("Check this out: How bees dance https://example.com/bees", null)
        assertThat(source).isEqualTo(SongSource.WebPage("https://example.com/bees", "Check this out: How bees dance"))
    }

    @Test
    fun trailingPunctuationIsNotPartOfTheUrl() {
        val source = ShareParser.parseShare("Read (https://example.com/a/b?x=1).", null) as SongSource.WebPage
        assertThat(source.url).isEqualTo("https://example.com/a/b?x=1")
    }

    @Test
    fun highlightedTextFromChromeIsSungDirectly() {
        val shared = "\"The waggle dance tells sisters where the flowers are\"\nhttps://example.com/bees#:~:text=The%20waggle%20dance"
        val source = ShareParser.parseShare(shared, null)
        assertThat(source).isInstanceOf(SongSource.Text::class.java)
        source as SongSource.Text
        assertThat(source.text).isEqualTo("The waggle dance tells sisters where the flowers are")
        assertThat(source.url).isEqualTo("https://example.com/bees")
    }

    @Test
    fun longTextWithALinkIsSungNotFetched() {
        val paragraph = (1..40).joinToString(" ") { "word$it" }
        val source = ShareParser.parseShare("$paragraph https://example.com/post", "A post")
        assertThat(source).isInstanceOf(SongSource.Text::class.java)
        assertThat((source as SongSource.Text).titleHint).isEqualTo("A post")
    }

    @Test
    fun plainTextWithoutALink() {
        val source = ShareParser.parseShare("Bees are amazing little creatures", null)
        assertThat(source).isEqualTo(SongSource.Text("Bees are amazing little creatures", null, null))
    }

    @Test
    fun selectionNeedsAFewWords() {
        assertThat(ShareParser.parseSelection("hi")).isNull()
        assertThat(ShareParser.parseSelection("  “sing these words please”  ")?.text).isEqualTo("sing these words please")
    }

    @Test
    fun nonHttpLinksAreRejected() {
        assertThat(ShareParser.parseShare("ftp://example.com/file", null)).isNull()
        assertThat(ShareParser.cleanUrl("javascript:alert(1)")).isNull()
        assertThat(ShareParser.parseShare("", null)).isNull()
        assertThat(ShareParser.parseShare(null, "subject only")).isNull()
    }

    @Test
    fun subjectThatIsAUrlIsNotUsedAsTitle() {
        val source = ShareParser.parseShare("https://example.com/x", "https://example.com/x") as SongSource.WebPage
        assertThat(source.titleHint).isNull()
    }

    @Test
    fun unusualButValidUrlsAreAccepted() {
        assertThat((ShareParser.parseShare("https://ja.wikipedia.org/wiki/ミツバチ", null) as SongSource.WebPage).url)
            .isEqualTo("https://ja.wikipedia.org/wiki/%E3%83%9F%E3%83%84%E3%83%90%E3%83%81")
        assertThat(ShareParser.cleanUrl("https://example.com/a|b")).isEqualTo("https://example.com/a%7Cb")
    }

    @Test
    fun siteNameDropsWww() {
        assertThat(ShareParser.siteName("https://www.theverge.com/2026/bees")).isEqualTo("theverge.com")
        assertThat(ShareParser.siteName(null)).isNull()
    }
}

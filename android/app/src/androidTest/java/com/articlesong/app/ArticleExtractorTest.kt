package com.articlesong.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.articlesong.app.extract.ArticleExtractionException
import com.articlesong.app.extract.WebViewArticleExtractor
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** The add-on's Readability.js + article_extract.js, running in a real WebView. */
@RunWith(AndroidJUnit4::class)
class ArticleExtractorTest {
    private val fake = FakeApis()
    private val extractor = WebViewArticleExtractor(TestApp.app, OkHttpClient())

    @Before fun start() { fake.start() }
    @After fun stop() = fake.close()

    private fun extract(path: String) = runBlocking { extractor.extract(fake.baseUrl.resolve(path).toString()) }

    @Test
    fun extractsTheArticleAndDropsTheChrome() {
        val article = extract("article")
        // Readability keeps short titles whole, same as in the add-on
        assertThat(article.title).isEqualTo("How bees dance - Science Daily")
        assertThat(article.siteName).isEqualTo("Science Daily")
        assertThat(article.text).contains("waggle dance")
        assertThat(article.text).contains("Karl von Frisch")
        assertThat(article.text).doesNotContain("We use cookies")
        assertThat(article.text).doesNotContain("All rights reserved")
    }

    @Test
    fun waitsForJavaScriptRenderedContent() {
        fake.articleHtml = """
            <html><head><title>Late page</title></head><body><div id="app">Loading…</div>
            <script>
              setTimeout(function () {
                document.getElementById('app').innerHTML = '<article><h1>Rendered later</h1>' +
                  '<p>' + 'This paragraph about honeybee navigation was rendered by JavaScript after load. '.repeat(8) + '</p></article>';
              }, 400);
            </script></body></html>
        """.trimIndent()
        assertThat(extract("article").text).contains("rendered by JavaScript after load")
    }

    @Test
    fun readsTextInsideShadowDom() {
        fake.articleHtml = """
            <html><head><title>Shadow</title></head><body><x-story></x-story>
            <script>
              const host = document.querySelector('x-story');
              const root = host.attachShadow({ mode: 'open' });
              root.innerHTML = '<article><h1>Inside the shadow</h1><p>' +
                'Web components hide this article about pollinators inside a shadow root. '.repeat(8) + '</p></article>';
            </script></body></html>
        """.trimIndent()
        assertThat(extract("article").text).contains("inside a shadow root")
    }

    @Test
    fun readsPdfsWithTheAddOnsPdfJs() {
        val article = extract("paper.pdf")
        assertThat(article.text).contains("Honeybees dance to tell each other where the flowers are")
        assertThat(article.title).isEmpty() // the share subject / file name is kept instead
    }

    @Test
    fun emptyPagesFailClearly() {
        fake.articleHtml = "<html><body><p>Subscribe!</p></body></html>"
        val error = assertThrows(ArticleExtractionException::class.java) { extract("article") }
        assertThat(error.message).contains("Couldn't find any article text")
    }

    @Test
    fun httpErrorsFailClearly() {
        val error = assertThrows(ArticleExtractionException::class.java) { extract("missing-page") }
        assertThat(error.message).contains("HTTP 404")
    }
}

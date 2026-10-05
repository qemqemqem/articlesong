package com.articlesong.app.api

import com.articlesong.app.data.CachedModel
import com.articlesong.app.recipe.SongRecipe
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * Real Anthropic API, real prompts (costs a few cents). Runs only via `just test-live`
 * (-Plive=true) with ANTHROPIC_API_KEY set - the Kotlin twin of tests/live-claude.js.
 */
class ClaudeLiveTest {
    private val key = System.getenv("ANTHROPIC_API_KEY").orEmpty()
    private val recipe = SongRecipe.parse(File(System.getProperty("articlesong.recipe")!!).readText())

    @Before
    fun optIn() {
        assumeTrue("live tests are opt-in", System.getProperty("articlesong.live") == "true")
        assumeTrue("ANTHROPIC_API_KEY not set", key.isNotBlank())
    }

    @Test
    fun writesLyricsAndStyleTagsWithTheSharedRecipe() = runBlocking {
        val cache = object : ModelCache {
            var model: CachedModel? = null
            override suspend fun get() = model
            override suspend fun put(model: CachedModel) { this.model = model }
        }
        val claude = ClaudeClient(key, "", cache)
        val model = claude.resolveModel()
        println("model: $model")
        assertThat(model).contains("claude")

        val style = recipe.defaultStyles.first { it.id == "informative" }
        val article = """Honeybees tell each other where food is with the waggle dance. The angle of the run
            relative to vertical encodes the direction of the flowers relative to the sun, and the length of
            the run encodes distance. Karl von Frisch decoded the dance and shared the 1973 Nobel Prize.""".trimIndent()

        val lyrics = claude.complete(recipe.lyricsSystemPrompt, recipe.lyricsPrompt(article, style), 16_000, Effort.HIGH)
        println("---- lyrics (${lyrics.length} chars) ----\n$lyrics")
        assertThat(lyrics).contains("[")
        assertThat(lyrics.length).isLessThan(5_000)

        val tags = claude.complete(recipe.styleSystemPrompt, recipe.styleTagsPrompt(lyrics, style), 8_000, Effort.LOW)
        println("---- style tags ----\n$tags")
        assertThat(tags).isNotEmpty()
        assertThat(tags.take(120).length).isAtMost(120)
    }
}

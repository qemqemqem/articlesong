package com.articlesong.app.recipe

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File

/**
 * The Kotlin port of prompts.js's template filling must render byte-for-byte what the add-on
 * renders. Goldens come from running add-on/prompts.js itself (tools/export-recipe.js), on
 * every build, so editing a prompt in the add-on can never silently diverge from the app.
 */
class RecipeGoldenTest {
    private val recipe = SongRecipe.parse(File(System.getProperty("articlesong.recipe")!!).readText())
    private val goldens = Json.parseToJsonElement(File(System.getProperty("articlesong.goldens")!!).readText()).jsonObject
    private val articles = goldens["articles"]!!.jsonObject.mapValues { it.value.jsonPrimitive.content }
    private val lyrics = goldens["lyrics"]!!.jsonPrimitive.content
    private val cases = goldens["cases"]!!.jsonArray.map { it.jsonObject }

    private fun JsonObject.style() = this["style"]!!.jsonObject.let {
        SongStyle(it["id"]!!.jsonPrimitive.content, it["name"]!!.jsonPrimitive.content, it["description"]!!.jsonPrimitive.content)
    }

    private fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.content

    @Test
    fun lyricsPromptsMatchTheAddOn() {
        val withArticles = cases.filter { it.text("article") != null }
        assertThat(withArticles).isNotEmpty()
        for (case in withArticles) {
            val style = case.style()
            val article = articles.getValue(case.text("article")!!)
            assertThat(recipe.lyricsPrompt(article, style)).isEqualTo(case.text("lyricsPrompt"))
        }
    }

    @Test
    fun sunoLyricsPromptsMatchTheAddOn() {
        for (case in cases.filter { it.text("article") != null }) {
            val style = case.style()
            val rendered = recipe.sunoLyricsPrompt(articles.getValue(case.text("article")!!), style)
            assertThat(rendered).isEqualTo(case.text("sunoLyricsPrompt"))
            assertThat(rendered.length).isAtMost(recipe.sunoLyricsPromptMaxChars)
        }
    }

    @Test
    fun styleTagPromptsMatchTheAddOn() {
        val tagCases = cases.filter { it.text("styleTagsPrompt") != null }
        assertThat(tagCases).isNotEmpty()
        for (case in tagCases) {
            assertThat(recipe.styleTagsPrompt(lyrics, case.style())).isEqualTo(case.text("styleTagsPrompt"))
        }
    }

    @Test
    fun fallbackStyleTagsMatchTheAddOn() {
        for (case in cases.filter { it.text("fallbackStyleTags") != null }) {
            assertThat(recipe.fallbackStyleTags(case.style())).isEqualTo(case.text("fallbackStyleTags"))
        }
    }

    @Test
    fun recipeHasTheAddOnsSixStyles() {
        assertThat(recipe.defaultStyles.map { it.id }).containsExactly("spoken", "musical", "meme", "cute", "informative", "pop").inOrder()
        assertThat(recipe.lyricsSystemPrompt).contains("professional songwriter")
    }

    @Test
    fun renderIsSinglePassAndStrict() {
        assertThat(SongRecipe.render("{{A}}|{{B}}", "A" to "{{B}}", "B" to "$&")).isEqualTo("{{B}}|$&")
        assertThrows(IllegalArgumentException::class.java) { SongRecipe.render("{{MISSING}}") }
    }

    @Test
    fun memeStyleGetsItsSpecialNote() {
        val meme = recipe.defaultStyles.first { it.id == "meme" }
        val prompt = recipe.styleTagsPrompt("la la", meme)
        assertThat(prompt).contains("Song style requested: Meme")
        assertThat(prompt).contains("Special note: This is intended as a humorous")
    }
}

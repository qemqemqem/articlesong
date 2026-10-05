package com.articlesong.app.recipe

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SongStyle(val id: String, val name: String, val description: String)

/**
 * The song recipe: prompts and default styles, exported from add-on/prompts.js at build time
 * (tools/export-recipe.js -> assets/recipe/song_recipe.json).
 *
 * The prompt TEXT lives only in prompts.js. The functions below are ports of its small
 * variable-filling functions; RecipeGoldenTest checks they render exactly what prompts.js does.
 */
@Serializable
data class SongRecipe(
    val version: Int,
    val defaultStyles: List<SongStyle>,
    val defaultStyleDescription: String,
    val lyricsSystemPrompt: String,
    val lyricsPromptTemplate: String,
    val styleSystemPrompt: String,
    val styleTagsPromptTemplate: String,
    val styleTagNotes: Map<String, String>,
    val sunoLyricsPromptTemplate: String,
    val sunoLyricsPromptMaxChars: Int,
    val fallbackStyleTags: Map<String, String>,
    val customFallbackStyleTagsTemplate: String,
) {
    /** prompts.js getLyricsPrompt() */
    fun lyricsPrompt(articleText: String, style: SongStyle): String = render(
        lyricsPromptTemplate,
        "STYLE_DESCRIPTION" to style.description.ifEmpty { defaultStyleDescription },
        "ARTICLE_TEXT" to articleText,
    )

    /** prompts.js getStyleTagsPrompt() */
    fun styleTagsPrompt(lyrics: String, style: SongStyle): String = render(
        styleTagsPromptTemplate,
        "LYRICS" to lyrics,
        "STYLE_NAME" to style.name,
        "STYLE_NOTE" to (styleTagNotes[style.id]?.let { "\n$it" } ?: ""),
    )

    /** prompts.js buildSunoLyricsPrompt(): style first, article excerpt fills the rest of the cap. */
    fun sunoLyricsPrompt(articleText: String, style: SongStyle): String {
        val room = sunoLyricsPromptMaxChars -
            render(sunoLyricsPromptTemplate, "STYLE_NAME" to style.name, "ARTICLE_EXCERPT" to "").length
        return render(
            sunoLyricsPromptTemplate,
            "STYLE_NAME" to style.name,
            "ARTICLE_EXCERPT" to collapseWhitespace(articleText).take(room.coerceAtLeast(0)),
        )
    }

    /** prompts.js getFallbackStyleTags() */
    fun fallbackStyleTags(style: SongStyle): String {
        fallbackStyleTags[style.id]?.let { return it }
        if (style.description.isNotEmpty()) {
            return STYLE_PREFIX.replaceFirst(style.description.take(100), "")
        }
        return render(customFallbackStyleTagsTemplate, "STYLE_NAME" to style.name)
    }

    companion object {
        const val ASSET_PATH = "recipe/song_recipe.json"

        private val json = Json { ignoreUnknownKeys = true }
        private val PLACEHOLDER = Regex("""\{\{(\w+)\}\}""")
        // Same explicit ASCII class as prompts.js; Java's \s and \v differ from JavaScript's.
        private val ASCII_WHITESPACE = Regex("[ \\t\\r\\n\\u000C\\u000B]+")
        private val STYLE_PREFIX = Regex("Style:[ \\t\\r\\n\\u000C\\u000B]*", RegexOption.IGNORE_CASE)

        fun parse(text: String): SongRecipe = json.decodeFromString(serializer(), text)

        fun fromAssets(context: Context): SongRecipe =
            context.assets.open(ASSET_PATH).bufferedReader().use { parse(it.readText()) }

        /** One pass, values are inserted literally and never re-scanned (same as renderTemplate in prompts.js). */
        fun render(template: String, vararg vars: Pair<String, String>): String {
            val values = vars.toMap()
            return PLACEHOLDER.replace(template) { match ->
                val key = match.groupValues[1]
                values[key] ?: throw IllegalArgumentException("Missing template variable: $key")
            }
        }

        fun collapseWhitespace(text: String): String =
            ASCII_WHITESPACE.replace(text, " ").removePrefix(" ").removeSuffix(" ")
    }
}

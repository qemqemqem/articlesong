package com.articlesong.app.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.articlesong.app.recipe.SongRecipe
import com.articlesong.app.recipe.SongStyle
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

data class AppSettings(
    val sunoApiKey: String,
    val anthropicApiKey: String,
    val sunoModel: String,
    /** Blank = pick the newest Opus automatically (same as the add-on). */
    val claudeModelOverride: String,
    val autoPlay: Boolean,
    val saveToMusic: Boolean,
    val styles: List<SongStyle>,
    val lastStyleId: String?,
) {
    val isConfigured: Boolean get() = sunoApiKey.isNotBlank()

    val defaultStyle: SongStyle get() = styles.firstOrNull { it.id == lastStyleId } ?: styles[1.coerceAtMost(styles.lastIndex)]
}

data class CachedModel(val id: String, val fetchedAt: Long)

class SettingsStore(
    private val dataStore: DataStore<Preferences>,
    private val recipe: SongRecipe,
) {
    val settings: Flow<AppSettings> = dataStore.data.map { it.toSettings() }

    suspend fun current(): AppSettings = settings.first()

    suspend fun setSunoApiKey(key: String) = edit { it[SUNO_KEY] = key.trim() }
    suspend fun setAnthropicApiKey(key: String) = edit { it[ANTHROPIC_KEY] = key.trim() }
    suspend fun setSunoModel(model: String) = edit { it[SUNO_MODEL] = model }
    suspend fun setClaudeModelOverride(model: String) = edit {
        it[CLAUDE_MODEL] = model.trim()
        it.remove(CLAUDE_MODEL_CACHE_ID) // re-resolve with the new preference
    }
    suspend fun setAutoPlay(enabled: Boolean) = edit { it[AUTO_PLAY] = enabled }
    suspend fun setSaveToMusic(enabled: Boolean) = edit { it[SAVE_TO_MUSIC] = enabled }
    suspend fun setLastStyle(id: String) = edit { it[LAST_STYLE] = id }

    /** Mirrors the add-on's style editor: renaming a style regenerates its id from the name. */
    suspend fun updateStyle(index: Int, name: String, description: String) = edit { prefs ->
        val styles = prefs.styles().toMutableList()
        styles[index] = SongStyle(id = styleIdFromName(name), name = name.trim(), description = description.trim())
        prefs[STYLES] = json.encodeToString(STYLE_LIST, styles)
    }

    suspend fun resetStyles() = edit { it.remove(STYLES) }

    suspend fun cachedClaudeModel(): CachedModel? = dataStore.data.first().let { prefs ->
        val id = prefs[CLAUDE_MODEL_CACHE_ID] ?: return null
        CachedModel(id, prefs[CLAUDE_MODEL_CACHE_AT] ?: 0)
    }

    suspend fun cacheClaudeModel(model: CachedModel) = edit {
        it[CLAUDE_MODEL_CACHE_ID] = model.id
        it[CLAUDE_MODEL_CACHE_AT] = model.fetchedAt
    }

    private suspend fun edit(block: (MutablePreferences) -> Unit) {
        dataStore.edit { block(it) }
    }

    private fun Preferences.styles(): List<SongStyle> =
        this[STYLES]?.let { json.decodeFromString(STYLE_LIST, it) } ?: recipe.defaultStyles

    private fun Preferences.toSettings() = AppSettings(
        sunoApiKey = this[SUNO_KEY].orEmpty(),
        anthropicApiKey = this[ANTHROPIC_KEY].orEmpty(),
        sunoModel = this[SUNO_MODEL] ?: DEFAULT_SUNO_MODEL,
        claudeModelOverride = this[CLAUDE_MODEL].orEmpty(),
        autoPlay = this[AUTO_PLAY] ?: true,
        saveToMusic = this[SAVE_TO_MUSIC] ?: true,
        styles = styles(),
        lastStyleId = this[LAST_STYLE],
    )

    companion object {
        const val DEFAULT_SUNO_MODEL = "V6"
        val SUNO_MODELS = listOf("V6", "V6_WILD", "V6_MINI", "V5_5", "V5", "V4_5PLUS", "V4_5ALL", "V4_5", "V4")

        private val SUNO_KEY = stringPreferencesKey("suno_api_key")
        private val ANTHROPIC_KEY = stringPreferencesKey("anthropic_api_key")
        private val SUNO_MODEL = stringPreferencesKey("suno_model")
        private val CLAUDE_MODEL = stringPreferencesKey("claude_model")
        private val AUTO_PLAY = booleanPreferencesKey("auto_play")
        private val SAVE_TO_MUSIC = booleanPreferencesKey("save_to_music")
        private val STYLES = stringPreferencesKey("styles_json")
        private val LAST_STYLE = stringPreferencesKey("last_style_id")
        private val CLAUDE_MODEL_CACHE_ID = stringPreferencesKey("claude_model_cache_id")
        private val CLAUDE_MODEL_CACHE_AT = longPreferencesKey("claude_model_cache_at")

        private val json = Json { ignoreUnknownKeys = true }
        private val STYLE_LIST = ListSerializer(SongStyle.serializer())

        /** Same as generateIdFromName() in add-on/styles.js. */
        fun styleIdFromName(name: String): String =
            name.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
    }
}

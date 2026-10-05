package com.articlesong.app.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** A SunoAPI error with a human-readable hint (codes from the SunoAPI docs, same as the add-on). */
class SunoApiException(val code: Int, message: String) : Exception(message)

class SunoGenerationFailed(message: String) : Exception(message)

data class SunoTrack(
    val id: String?,
    val audioUrl: String?,
    val streamUrl: String?,
    val imageUrl: String?,
    val title: String?,
    val lyrics: String?,
    val tags: String?,
    val durationSec: Double?,
) {
    val playUrl: String? get() = audioUrl ?: streamUrl
}

data class SunoTask(val status: String, val tracks: List<SunoTrack>, val errorMessage: String?) {
    val isFailed: Boolean get() = status in FAILURE_STATUSES
    val isComplete: Boolean get() = status == "SUCCESS"

    companion object {
        // Terminal failure statuses documented by SunoAPI (record-info)
        val FAILURE_STATUSES = setOf(
            "FAILED", "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "GENERATE_LYRICS_FAILED",
            "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR",
        )
    }
}

data class SunoLyricsTask(val status: String, val text: String?, val errorMessage: String?) {
    val isFailed: Boolean get() = status in SunoTask.FAILURE_STATUSES
}

class SunoClient(
    private val http: OkHttpClient,
    private val baseUrl: () -> HttpUrl = { DEFAULT_BASE_URL.toHttpUrl() },
    private val apiKey: suspend () -> String,
) {
    /** Starts a custom-mode generation (our lyrics + style tags). Returns the task id. */
    suspend fun generate(model: String, lyrics: String, style: String, title: String): String {
        val body = buildJsonObject {
            put("callBackUrl", CALLBACK_URL)
            put("customMode", true)
            put("instrumental", false)
            put("model", model)
            put("prompt", lyrics.take(MAX_LYRICS))
            put("style", style.take(MAX_STYLE))
            put("title", title.take(MAX_TITLE))
        }
        return post("api/v1/generate", body).string("taskId")
            ?: throw SunoApiException(0, "SunoAPI returned no task id")
    }

    suspend fun recordInfo(taskId: String): SunoTask {
        val data = get("api/v1/generate/record-info", "taskId" to taskId)
        val tracks = (data.obj("response")?.get("sunoData") as? JsonArray).orEmpty()
            .mapNotNull { (it as? JsonObject)?.toTrack() }
        return SunoTask(data.string("status") ?: "PENDING", tracks, data.string("errorMessage"))
    }

    /** Lyrics-only generation, used when no Anthropic key is configured. Returns the task id. */
    suspend fun generateLyrics(prompt: String): String {
        val body = buildJsonObject {
            put("callBackUrl", CALLBACK_URL)
            put("prompt", prompt)
        }
        return post("api/v1/lyrics", body).string("taskId")
            ?: throw SunoApiException(0, "SunoAPI lyrics returned no task id")
    }

    suspend fun lyricsRecordInfo(taskId: String): SunoLyricsTask {
        val data = get("api/v1/lyrics/record-info", "taskId" to taskId)
        val first = (data.obj("response")?.get("data") as? JsonArray)?.firstOrNull() as? JsonObject
        return SunoLyricsTask(data.string("status") ?: "PENDING", first?.string("text"), data.string("errorMessage"))
    }

    suspend fun credits(): Int {
        val response = request(Request.Builder().url(url("api/v1/generate/credit")))
        return (response["data"] as? JsonPrimitive)?.intOrNull
            ?: throw SunoApiException(0, "SunoAPI returned no credit balance")
    }

    private suspend fun post(path: String, body: JsonObject): JsonObject =
        request(Request.Builder().url(url(path)).post(body.toString().toRequestBody(JSON_TYPE))).data()

    private suspend fun get(path: String, vararg query: Pair<String, String>): JsonObject {
        val url = url(path).newBuilder().apply { query.forEach { (k, v) -> addQueryParameter(k, v) } }.build()
        return request(Request.Builder().url(url)).data()
    }

    private fun url(path: String): HttpUrl = baseUrl().resolve(path)!!

    private suspend fun request(builder: Request.Builder): JsonObject {
        val key = apiKey()
        if (key.isBlank()) throw SunoApiException(401, "Add your SunoAPI key in Settings")
        val response = http.newCall(builder.header("Authorization", "Bearer $key").build()).await()
        // Main-safe: the body is read from the socket, so never on the caller's (maybe main) thread.
        val text = withContext(Dispatchers.IO) { response.use { it.body.string() } }
        if (!response.isSuccessful) {
            throw SunoApiException(response.code, "SunoAPI HTTP ${response.code}: ${hint(response.code) ?: text.take(200)}")
        }
        val envelope = runCatching { json.parseToJsonElement(text).jsonObject }.getOrElse {
            throw SunoApiException(0, "SunoAPI returned something that isn't JSON: ${text.take(200)}")
        }
        val code = (envelope["code"] as? JsonPrimitive)?.intOrNull ?: 0
        if (code != 200) {
            val msg = (envelope["msg"] as? JsonPrimitive)?.content
            throw SunoApiException(code, "SunoAPI error $code: ${hint(code) ?: msg ?: "unknown error"}")
        }
        return envelope
    }

    private fun JsonObject.data(): JsonObject = this["data"] as? JsonObject
        ?: throw SunoApiException(0, "SunoAPI response had no data")

    // SunoAPI documents camelCase and snake_case variants across endpoints; accept both.
    private fun JsonObject.toTrack() = SunoTrack(
        id = string("id"),
        audioUrl = string("audioUrl", "audio_url"),
        streamUrl = string("streamAudioUrl", "stream_audio_url"),
        imageUrl = string("imageUrl", "image_url"),
        title = string("title"),
        lyrics = string("prompt"),
        tags = string("tags"),
        durationSec = (this["duration"] as? JsonPrimitive)?.doubleOrNull,
    )

    companion object {
        const val DEFAULT_BASE_URL = "https://api.sunoapi.org/"
        // SunoAPI requires a callback URL; we poll record-info instead (same placeholder as the add-on).
        private const val CALLBACK_URL = "https://webhook.site/unique-uuid-here"
        const val MAX_LYRICS = 5000
        const val MAX_STYLE = 1000
        const val MAX_TITLE = 80

        private val JSON_TYPE = "application/json".toMediaType()
        private val json = Json { ignoreUnknownKeys = true }

        private val ERROR_HINTS = mapOf(
            400 to "invalid parameters",
            401 to "your SunoAPI key was rejected - check it in Settings",
            405 to "rate limit exceeded",
            413 to "prompt too long",
            429 to "insufficient SunoAPI credits",
            430 to "calling too frequently, try again shortly",
            455 to "SunoAPI is under maintenance",
        )

        fun hint(code: Int): String? = ERROR_HINTS[code]

        private fun JsonObject.string(vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
            (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.takeIf { it.isNotBlank() }
        }

        private fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
    }
}

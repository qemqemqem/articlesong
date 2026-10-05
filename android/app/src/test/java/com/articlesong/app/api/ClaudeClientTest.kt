package com.articlesong.app.api

import com.articlesong.app.data.CachedModel
import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

/** The real Anthropic Java SDK against a local fake API. */
class ClaudeClientTest {
    private lateinit var fake: FakeApis
    private val cache = object : ModelCache {
        var stored: CachedModel? = null
        override suspend fun get() = stored
        override suspend fun put(model: CachedModel) { stored = model }
    }

    @Before
    fun setUp() {
        fake = FakeApis().start()
    }

    @After
    fun tearDown() = fake.close()

    private fun client(override: String = "") = ClaudeClient("sk-ant-test", override, cache, fake.baseUrl.toString().removeSuffix("/"))

    private fun messageBodies(): List<JsonObject> =
        fake.requestsTo("/v1/messages").map { Json.parseToJsonElement(it.body!!.utf8()).jsonObject }

    @Test
    fun picksNewestOpusAndCachesIt() = runBlocking {
        val model = client().resolveModel()
        // Fable is listed first, but the add-on's preference is Opus > Sonnet > Haiku.
        assertThat(model).isEqualTo("claude-opus-5-5")
        assertThat(cache.stored?.id).isEqualTo("claude-opus-5-5")
        assertThat(fake.requestsTo("/v1/models").single().headers["x-api-key"]).isEqualTo("sk-ant-test")

        client().resolveModel()
        assertThat(fake.requestsTo("/v1/models")).hasSize(1) // served from cache
    }

    @Test
    fun overrideSkipsModelLookup() = runBlocking {
        assertThat(client(override = "claude-sonnet-5-5").resolveModel()).isEqualTo("claude-sonnet-5-5")
        assertThat(fake.requestsTo("/v1/models")).isEmpty()
    }

    @Test
    fun pickBestModelFallsBackThroughFamilies() {
        assertThat(ClaudeClient.pickBestModel(listOf("claude-haiku-4-5", "claude-sonnet-5"))).isEqualTo("claude-sonnet-5")
        assertThat(ClaudeClient.pickBestModel(listOf("mystery-model"))).isEqualTo("mystery-model")
        assertThrows(ClaudeException::class.java) { ClaudeClient.pickBestModel(emptyList()) }
    }

    @Test
    fun completeSendsAdaptiveThinkingEffortAndFallbacks() = runBlocking {
        val text = client().complete("system prompt", "write lyrics", 16_000, Effort.HIGH)
        assertThat(text).isEqualTo(FakeApis.LYRICS)

        val request = fake.requestsTo("/v1/messages").single()
        assertThat(request.headers["anthropic-beta"]).contains("server-side-fallback-2026-07-01")
        val body = messageBodies().single()
        assertThat(body["model"]!!.jsonPrimitive.content).isEqualTo("claude-opus-5-5")
        assertThat(body["max_tokens"]!!.jsonPrimitive.content).isEqualTo("16000")
        assertThat(body["system"]!!.jsonPrimitive.content).isEqualTo("system prompt")
        assertThat(body["thinking"]!!.jsonObject["type"]!!.jsonPrimitive.content).isEqualTo("adaptive")
        assertThat(body["output_config"]!!.jsonObject["effort"]!!.jsonPrimitive.content).isEqualTo("high")
        assertThat(body["fallbacks"]!!.jsonPrimitive.content).isEqualTo("default")
        val content = body["messages"]!!.jsonArray.single().jsonObject
        assertThat(content["role"]!!.jsonPrimitive.content).isEqualTo("user")
        assertThat(content.toString()).contains("write lyrics")
    }

    @Test
    fun retiredModelIsReResolvedOnce() = runBlocking {
        cache.stored = CachedModel("claude-opus-4-1", System.currentTimeMillis())
        fake.claudeScript += FakeApis.claudeError(404, "not_found_error", "model: claude-opus-4-1")
        val text = client().complete("s", "p", 1000, Effort.LOW)
        assertThat(text).isEqualTo(FakeApis.LYRICS)
        assertThat(messageBodies().map { it["model"]!!.jsonPrimitive.content }).containsExactly("claude-opus-4-1", "claude-opus-5-5").inOrder()
    }

    @Test
    fun modelThatRejectsThinkingIsRetriedPlain() = runBlocking {
        fake.claudeScript += FakeApis.claudeError(400, "invalid_request_error", "thinking is not supported on this model")
        client(override = "claude-old-model").complete("s", "p", 1000, Effort.LOW)
        val (first, second) = messageBodies()
        assertThat(first.containsKey("thinking")).isTrue()
        assertThat(second.containsKey("thinking")).isFalse()
        assertThat(second.containsKey("output_config")).isFalse()
    }

    @Test
    fun otherBadRequestsAreNotRetried() {
        fake.claudeScript += FakeApis.claudeError(400, "invalid_request_error", "prompt is too long")
        assertThrows(Exception::class.java) { runBlocking { client(override = "claude-opus-5-5").complete("s", "p", 1000, Effort.LOW) } }
        assertThat(fake.requestsTo("/v1/messages")).hasSize(1)
    }

    @Test
    fun refusalIsAClearError() {
        fake.claudeScript += FakeApis.claudeMessage("claude-opus-5-5", "", stopReason = "refusal")
        val error = assertThrows(ClaudeException::class.java) {
            runBlocking { client(override = "claude-opus-5-5").complete("s", "p", 1000, Effort.LOW) }
        }
        assertThat(error.message).contains("declined")
    }

    @Test
    fun badKeyIsAClearError() {
        fake.claudeScript += FakeApis.claudeError(401, "authentication_error", "invalid x-api-key")
        val error = assertThrows(ClaudeException::class.java) {
            runBlocking { client(override = "claude-opus-5-5").complete("s", "p", 1000, Effort.LOW) }
        }
        assertThat(error.message).contains("rejected your API key")
    }
}

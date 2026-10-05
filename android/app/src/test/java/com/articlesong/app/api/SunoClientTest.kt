package com.articlesong.app.api

import com.articlesong.app.testing.FakeApis
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class SunoClientTest {
    private lateinit var fake: FakeApis
    private var key = "suno-test-key"
    private lateinit var client: SunoClient

    @Before
    fun setUp() {
        fake = FakeApis().start()
        client = SunoClient(OkHttpClient(), { fake.baseUrl }, { key })
    }

    @After
    fun tearDown() = fake.close()

    @Test
    fun generateSendsCustomModeRequestWithAuth() = runBlocking {
        val taskId = client.generate("V6", "x".repeat(6000), "Indie Folk", "T".repeat(100))
        assertThat(taskId).isEqualTo("task-1")
        val request = fake.requestsTo("/api/v1/generate").single()
        assertThat(request.headers["Authorization"]).isEqualTo("Bearer suno-test-key")
        val body = Json.parseToJsonElement(request.body!!.utf8()).jsonObject
        assertThat(body["customMode"]!!.jsonPrimitive.boolean).isTrue()
        assertThat(body["instrumental"]!!.jsonPrimitive.boolean).isFalse()
        assertThat(body["model"]!!.jsonPrimitive.content).isEqualTo("V6")
        assertThat(body["prompt"]!!.jsonPrimitive.content).hasLength(SunoClient.MAX_LYRICS)
        assertThat(body["title"]!!.jsonPrimitive.content).hasLength(SunoClient.MAX_TITLE)
        assertThat(body["callBackUrl"]).isNotNull()
    }

    @Test
    fun apiErrorCodesBecomeReadableMessages() {
        fake.generateCode = 429
        val error = assertThrows(SunoApiException::class.java) { runBlocking { client.generate("V6", "la", "pop", "t") } }
        assertThat(error.code).isEqualTo(429)
        assertThat(error.message).contains("insufficient SunoAPI credits")
    }

    @Test
    fun httpErrorsAreReported() {
        val server = MockWebServer().apply {
            enqueue(FakeApis.json("""{"msg":"bad key"}""", code = 401))
            start()
        }
        val c = SunoClient(OkHttpClient(), { server.url("/") }, { key })
        val error = assertThrows(SunoApiException::class.java) { runBlocking { c.credits() } }
        assertThat(error.message).contains("rejected")
        server.close()
    }

    @Test
    fun missingKeyFailsBeforeAnyRequest() {
        key = ""
        val error = assertThrows(SunoApiException::class.java) { runBlocking { client.credits() } }
        assertThat(error.message).contains("Settings")
        assertThat(fake.requests).isEmpty()
    }

    @Test
    fun recordInfoProgressesFromPendingToSuccess() = runBlocking {
        val pending = client.recordInfo("task-1")
        assertThat(pending.status).isEqualTo("PENDING")
        assertThat(pending.tracks).isEmpty()

        val streaming = client.recordInfo("task-1")
        assertThat(streaming.status).isEqualTo("TEXT_SUCCESS")
        assertThat(streaming.tracks.single().streamUrl).endsWith("/stream.mp3")
        assertThat(streaming.tracks.single().audioUrl).isNull() // blank string is treated as absent
        assertThat(streaming.tracks.single().playUrl).endsWith("/stream.mp3")

        client.recordInfo("task-1")
        val done = client.recordInfo("task-1")
        assertThat(done.isComplete).isTrue()
        assertThat(done.tracks.single().audioUrl).endsWith("/audio.mp3")
        assertThat(done.tracks.single().title).isEqualTo("The Waggle Dance")
        assertThat(done.tracks.single().durationSec).isEqualTo(8.0)
        assertThat(fake.requestsTo("/api/v1/generate/record-info").first().url.queryParameter("taskId")).isEqualTo("task-1")
    }

    @Test
    fun recordInfoAcceptsCamelCaseFields() = runBlocking {
        val server = MockWebServer().apply {
            enqueue(
                FakeApis.json(
                    """{"code":200,"msg":"success","data":{"status":"FIRST_SUCCESS","response":{"sunoData":[
                       {"id":"a","streamAudioUrl":"https://cdn/s","audioUrl":"https://cdn/a.mp3","imageUrl":"https://cdn/i.jpg","title":"Hi","duration":181.5}]}}}""",
                ),
            )
            start()
        }
        val track = SunoClient(OkHttpClient(), { server.url("/") }, { key }).recordInfo("t").tracks.single()
        assertThat(track.streamUrl).isEqualTo("https://cdn/s")
        assertThat(track.audioUrl).isEqualTo("https://cdn/a.mp3")
        assertThat(track.imageUrl).isEqualTo("https://cdn/i.jpg")
        assertThat(track.durationSec).isEqualTo(181.5)
        server.close()
    }

    @Test
    fun failureStatusesAreRecognised() = runBlocking {
        fake.sunoStatuses = listOf("SENSITIVE_WORD_ERROR")
        fake.sunoErrorMessage = "contains prohibited words"
        val task = client.recordInfo("task-1")
        assertThat(task.isFailed).isTrue()
        assertThat(task.errorMessage).isEqualTo("contains prohibited words")
    }

    @Test
    fun lyricsAndCredits() = runBlocking {
        assertThat(client.generateLyrics("Style: Pop. A song about: bees")).isEqualTo("lyrics-1")
        val lyrics = client.lyricsRecordInfo("lyrics-1")
        assertThat(lyrics.status).isEqualTo("SUCCESS")
        assertThat(lyrics.text).isEqualTo(FakeApis.LYRICS)
        assertThat(client.credits()).isEqualTo(420)
    }
}

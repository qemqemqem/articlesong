package com.articlesong.app.testing

import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.HttpUrl
import okio.Buffer
import java.util.concurrent.CopyOnWriteArrayList

/**
 * One local server that impersonates everything the app talks to: SunoAPI, the Anthropic API,
 * an article page and the audio/cover downloads. Shared by JVM unit tests and on-device tests.
 */
class FakeApis : Dispatcher() {
    val server = MockWebServer()
    val requests = CopyOnWriteArrayList<RecordedRequest>()

    // ---- knobs ----
    var articleHtml: String = ARTICLE_HTML
    /** record-info statuses, one per poll; the last one repeats. */
    var sunoStatuses: List<String> = listOf("PENDING", "TEXT_SUCCESS", "FIRST_SUCCESS", "SUCCESS")
    var sunoErrorMessage: String? = null
    var generateCode = 200
    var creditsLeft = 420
    var claudeModels = listOf("claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5")
    var lyrics = LYRICS
    var styleTags = "Sunlit Indie Folk, Warm, 96 BPM, Fingerpicked Guitar, Breathy Vocals"
    var songTitle = "The Waggle Dance"
    /** Optional scripted responses for /v1/messages, consumed in order before the defaults. */
    val claudeScript = ArrayDeque<MockResponse>()
    var audioBytes: ByteArray = ByteArray(2048) { (it % 251).toByte() }
    var coverBytes: ByteArray = ByteArray(512) { (it % 13).toByte() }

    private var recordInfoPolls = 0

    val baseUrl: HttpUrl get() = server.url("/")

    fun start(): FakeApis = apply {
        server.dispatcher = this
        server.start()
    }

    override fun close() {
        super.close()
        server.close()
    }

    fun requestsTo(path: String) = requests.filter { it.url.encodedPath == path }

    override fun dispatch(request: RecordedRequest): MockResponse {
        requests += request
        val response = route(request)
        // Like a real server: HEAD gets the headers only (a body would desync the kept-alive connection).
        return if (request.method == "HEAD") response.newBuilder().body("").build() else response
    }

    private fun route(request: RecordedRequest): MockResponse {
        return when (request.url.encodedPath) {
            "/v1/models" -> json(
                """{"data":[${claudeModels.joinToString(",") { """{"type":"model","id":"$it","display_name":"$it","created_at":"2026-09-01T00:00:00Z"}""" }}],
                   "has_more":false,"first_id":"${claudeModels.firstOrNull()}","last_id":"${claudeModels.lastOrNull()}"}""",
            )
            "/v1/messages" -> claudeScript.removeFirstOrNull() ?: run {
                val body = request.body?.utf8().orEmpty()
                val model = Regex("\"model\":\"([^\"]+)\"").find(body)?.groupValues?.get(1) ?: "claude-opus-5-5"
                claudeMessage(model, if (body.contains("music style consultant")) styleTags else lyrics)
            }
            "/api/v1/generate" -> json("""{"code":$generateCode,"msg":"${if (generateCode == 200) "success" else "nope"}","data":{"taskId":"task-1"}}""")
            "/api/v1/generate/record-info" -> {
                val status = sunoStatuses[minOf(recordInfoPolls++, sunoStatuses.lastIndex)]
                json(recordInfo(status))
            }
            "/api/v1/lyrics" -> json("""{"code":200,"msg":"success","data":{"taskId":"lyrics-1"}}""")
            "/api/v1/lyrics/record-info" -> json(
                """{"code":200,"msg":"success","data":{"taskId":"lyrics-1","status":"SUCCESS",
                   "response":{"taskId":"lyrics-1","data":[{"text":${quote(lyrics)},"title":"Bees","status":"complete"}]}}}""",
            )
            "/api/v1/generate/credit" -> json("""{"code":200,"msg":"success","data":$creditsLeft}""")
            "/article" -> MockResponse.Builder().setHeader("Content-Type", "text/html; charset=utf-8").body(articleHtml).build()
            "/paper.pdf" -> MockResponse.Builder().setHeader("Content-Type", "application/pdf").body(Buffer().write(minimalPdf(PDF_TEXT))).build()
            "/audio.mp3", "/stream.mp3" -> MockResponse.Builder().setHeader("Content-Type", "audio/mpeg").body(Buffer().write(audioBytes)).build()
            "/cover.jpg" -> MockResponse.Builder().setHeader("Content-Type", "image/jpeg").body(Buffer().write(coverBytes)).build()
            else -> MockResponse.Builder().code(404).body("not found").build()
        }
    }

    private fun recordInfo(status: String): String {
        val streaming = status in setOf("TEXT_SUCCESS", "FIRST_SUCCESS", "SUCCESS")
        // Suno documents snake_case here; the app must also accept camelCase (covered in unit tests).
        val track = if (!streaming) "" else """{
            "id":"audio-1",
            "stream_audio_url":"${baseUrl.resolve("stream.mp3")}",
            "audio_url":"${if (status == "SUCCESS") baseUrl.resolve("audio.mp3") else ""}",
            "image_url":"${baseUrl.resolve("cover.jpg")}",
            "title":${quote(songTitle)},
            "prompt":${quote(lyrics)},
            "tags":"folk",
            "duration":${if (status == "SUCCESS") "8.0" else "null"}
        }"""
        val error = sunoErrorMessage?.let(::quote) ?: "null"
        return """{"code":200,"msg":"success","data":{"taskId":"task-1","status":"$status",
            "response":{"taskId":"task-1","sunoData":[$track]},"errorMessage":$error}}"""
    }

    companion object {
        fun json(body: String, code: Int = 200): MockResponse =
            MockResponse.Builder().code(code).setHeader("Content-Type", "application/json").body(body).build()

        fun claudeMessage(model: String, text: String, stopReason: String = "end_turn"): MockResponse = json(
            """{"id":"msg_test","type":"message","role":"assistant","model":"$model",
               "content":[{"type":"thinking","thinking":"","signature":"sig"},{"type":"text","text":${quote(text)}}],
               "stop_reason":"$stopReason","stop_sequence":null,"usage":{"input_tokens":12,"output_tokens":34}}""",
        )

        fun claudeError(code: Int, type: String, message: String): MockResponse = json(
            """{"type":"error","error":{"type":"$type","message":${quote(message)}}}""", code,
        )

        fun quote(s: String): String = buildString {
            append('"')
            s.forEach { c ->
                when (c) {
                    '"' -> append("\\\"")
                    '\\' -> append("\\\\")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> if (c < ' ') append("\\u%04x".format(c.code)) else append(c)
                }
            }
            append('"')
        }

        /** A one-page PDF with real text, same construction as the add-on's tests/pdf.test.js. */
        fun minimalPdf(text: String): ByteArray {
            // pdf.js only reports glyphs on the page, so wrap into lines that fit.
            val lines = text.split(" ").fold(mutableListOf("")) { acc, word ->
                if ((acc.last() + " " + word).length > 60) acc += word else acc[acc.lastIndex] = (acc.last() + " " + word).trim()
                acc
            }
            val stream = "BT /F1 12 Tf 14 TL 72 700 Td " + lines.joinToString(" T* ") { "($it) Tj" } + " ET"
            val objects = listOf(
                "<< /Type /Catalog /Pages 2 0 R >>",
                "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
                "<< /Length ${stream.length} >>\nstream\n$stream\nendstream",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            )
            val out = StringBuilder("%PDF-1.4\n")
            val offsets = objects.mapIndexed { i, obj ->
                out.length.also { out.append("${i + 1} 0 obj\n$obj\nendobj\n") }
            }
            val xref = out.length
            out.append("xref\n0 ${objects.size + 1}\n0000000000 65535 f \n")
            offsets.forEach { out.append("%010d 00000 n \n".format(it)) }
            out.append("trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n$xref\n%%EOF")
            return out.toString().toByteArray(Charsets.ISO_8859_1)
        }

        const val PDF_TEXT = "Honeybees dance to tell each other where the flowers are. " +
            "The waggle dance encodes the direction of the food relative to the sun, " +
            "and the length of the waggle run encodes the distance to the flowers. " +
            "Scientists decoded this language in the twentieth century."

        val LYRICS = """
            [Verse]
            The scouts come home and they dance across the comb,
            Telling every sister where the clover fields have grown.

            [Chorus]
            So waggle to the left and waggle to the right,
            The sun is our compass and the hive will eat tonight.
        """.trimIndent()

        val ARTICLE_HTML = """
            <!doctype html>
            <html><head><title>How bees dance - Science Daily</title>
            <meta property="og:site_name" content="Science Daily"></head>
            <body>
              <nav><a href="/">Home</a> <a href="/news">News</a> <a href="/about">About us</a></nav>
              <div class="cookie-banner" role="dialog">We use cookies to improve your experience. Accept all?</div>
              <article>
                <h1>How bees dance</h1>
                <p>Honeybees communicate the location of food through a remarkable behaviour called the waggle dance.
                   A forager returning to the hive performs a figure-eight pattern on the vertical honeycomb.</p>
                <p>The angle of the straight waggle run relative to vertical tells her sisters the direction of the
                   flowers relative to the sun. The duration of the run encodes the distance, roughly one second per kilometre.</p>
                <p>Karl von Frisch decoded the dance in the 1940s and later shared a Nobel Prize for the discovery.
                   Modern researchers use robotic bees to test which parts of the dance the other bees actually read.</p>
                <p>The dance is so precise that scientists can map a colony's foraging range just by filming dances inside the hive.</p>
              </article>
              <footer>Copyright Science Daily. All rights reserved. Privacy policy. Terms of service.</footer>
            </body></html>
        """.trimIndent()
    }
}

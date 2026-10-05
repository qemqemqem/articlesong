package com.articlesong.app.extract

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.articlesong.app.api.await
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import kotlin.coroutines.resume

data class ExtractedArticle(val title: String, val text: String, val siteName: String?)

fun interface ArticleExtractor {
    suspend fun extract(url: String): ExtractedArticle
}

class ArticleExtractionException(message: String) : Exception(message)

/**
 * Reads an article the same way the browser add-on does: loads the page in a (headless)
 * WebView and runs the add-on's own Readability.js + article_extract.js against the live DOM,
 * so JavaScript-rendered pages and shadow-DOM sites work. PDFs are extracted with the add-on's
 * bundled pdf.js and pdf.js wrapper inside a local asset page.
 */
class WebViewArticleExtractor(
    private val context: Context,
    private val http: OkHttpClient,
) : ArticleExtractor {

    private val extractionScript: String by lazy {
        listOf("addon/Readability.js", "addon/article_extract.js").joinToString(";\n") { asset ->
            context.assets.open(asset).bufferedReader().use { it.readText() }
        } + ";\n" + RUN_EXTRACTION
    }

    override suspend fun extract(url: String): ExtractedArticle {
        val pdfBytes = fetchIfPdf(url)
        val article = if (pdfBytes != null) extractPdf(url, pdfBytes) else extractWebPage(url)
        if (article.text.trim().length < MIN_ARTICLE_CHARS) {
            throw ArticleExtractionException(
                "Couldn't find any article text on that page. Try highlighting the text and sharing it instead.",
            )
        }
        return article
    }

    /** Returns the PDF's bytes if [url] is a PDF, null for anything else (including HEAD failures). */
    private suspend fun fetchIfPdf(url: String): ByteArray? {
        val looksLikePdf = Uri.parse(url).path.orEmpty().endsWith(".pdf", ignoreCase = true)
        if (!looksLikePdf) {
            val contentType = runCatching {
                http.newCall(browserRequest(url).head().build()).await().use { it.header("Content-Type") }
            }.getOrNull()
            if (contentType?.contains("application/pdf", ignoreCase = true) != true) return null
        }
        val response = http.newCall(browserRequest(url).build()).await()
        return withContext(Dispatchers.IO) {
            response.use {
                if (!it.isSuccessful) throw ArticleExtractionException("Couldn't download the PDF (HTTP ${it.code})")
                it.body.bytes()
            }
        }
    }

    private fun browserRequest(url: String) = Request.Builder().url(url)
        .header("User-Agent", WebSettings.getDefaultUserAgent(context))

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun extractWebPage(url: String): ExtractedArticle = withContext(Dispatchers.Main) {
        val webView = WebView(context)
        try {
            webView.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                blockNetworkImage = true
                mediaPlaybackRequiresUserGesture = true
            }
            // A detached WebView still needs a viewport for layout-dependent pages.
            webView.layout(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
            val tracker = PageLoadTracker()
            webView.webViewClient = tracker
            webView.loadUrl(url)
            try {
                withTimeout(PAGE_TIMEOUT_MS) { tracker.awaitSettled() }
            } catch (e: TimeoutCancellationException) {
                if (!tracker.anyPageFinished) throw ArticleExtractionException("The page took too long to load")
                // Slow trackers/ads keep firing; the article is usually there by now.
            }
            parseExtraction(webView.evaluate(extractionScript), fallbackTitle = webView.title.orEmpty())
        } finally {
            webView.stopLoading()
            webView.destroy()
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "RequiresFeature")
    private suspend fun extractPdf(url: String, bytes: ByteArray): ExtractedArticle = withContext(Dispatchers.Main) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            throw ArticleExtractionException("This device's WebView is too old to read PDFs. Update Android System WebView.")
        }
        val webView = WebView(context)
        try {
            val assetLoader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                .addPathHandler("/pdf/") { path ->
                    if (path == "document.pdf") WebResourceResponse("application/pdf", null, ByteArrayInputStream(bytes)) else null
                }
                .build()
            webView.settings.javaScriptEnabled = true
            webView.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    assetLoader.shouldInterceptRequest(request.url)
            }
            val result = CompletableDeferred<String>()
            WebViewCompat.addWebMessageListener(webView, "ArticleSongBridge", setOf(ASSET_ORIGIN)) { _, message, _, _, _ ->
                result.complete(message.data.orEmpty())
            }
            webView.loadUrl("$ASSET_ORIGIN/assets/extract/pdf_host.html")
            val raw = try {
                withTimeout(PDF_TIMEOUT_MS) { result.await() }
            } catch (_: TimeoutCancellationException) {
                throw ArticleExtractionException("Reading the PDF took too long. Try highlighting the text and sharing it instead.")
            }
            val parsed = json.decodeFromString(PdfResult.serializer(), raw)
            if (!parsed.ok) throw ArticleExtractionException("Couldn't read the PDF: ${parsed.error}")
            // A PDF has no reliable title; keep the share subject or the file-name placeholder.
            ExtractedArticle(title = "", text = parsed.text.orEmpty(), siteName = null)
        } finally {
            webView.destroy()
        }
    }

    private fun parseExtraction(evaluated: String, fallbackTitle: String): ExtractedArticle {
        // evaluateJavascript hands back a JSON value; our script returns a JSON *string* of the result.
        val inner = runCatching { json.decodeFromString<String>(evaluated) }.getOrNull()
            ?: throw ArticleExtractionException("The page blocked article extraction")
        val result = json.decodeFromString(PageResult.serializer(), inner)
        val article = result.article
        if (!result.ok || article == null) throw ArticleExtractionException("Couldn't read the page: ${result.error}")
        return ExtractedArticle(
            title = article.title.ifBlank { fallbackTitle },
            text = article.text,
            siteName = article.siteName.ifBlank { null },
        )
    }

    private suspend fun WebView.evaluate(script: String): String = suspendCancellableCoroutine { cont ->
        evaluateJavascript(script) { cont.resume(it ?: "null") }
    }

    /** Tracks main-frame loading; "settled" = loaded, then quiet (no new page-finished) for a moment. */
    private class PageLoadTracker : WebViewClient() {
        @Volatile var anyPageFinished = false
        @Volatile private var lastFinishedAt = 0L
        @Volatile private var failure: String? = null

        override fun onPageFinished(view: WebView, url: String) {
            anyPageFinished = true
            lastFinishedAt = SystemClock.uptimeMillis()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) failure = "Couldn't load the page (${error.description})"
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (request.isForMainFrame && response.statusCode >= 400) {
                failure = "The page returned HTTP ${response.statusCode}"
            }
        }

        // Stay on http(s); never follow intent://, market:// etc. out of a background WebView.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.url.scheme !in setOf("http", "https")

        suspend fun awaitSettled() {
            while (true) {
                failure?.let { throw ArticleExtractionException(it) }
                if (anyPageFinished && SystemClock.uptimeMillis() - lastFinishedAt >= SETTLE_MS) return
                delay(POLL_MS)
            }
        }
    }

    @Serializable private data class PageArticle(val title: String = "", val text: String = "", val siteName: String = "")
    @Serializable private data class PageResult(val ok: Boolean, val article: PageArticle? = null, val error: String? = null)
    @Serializable private data class PdfResult(val ok: Boolean, val text: String? = null, val error: String? = null)

    companion object {
        /** Same floor as the add-on: anything shorter is a cookie wall or error page, not an article. */
        const val MIN_ARTICLE_CHARS = 200
        private const val ASSET_ORIGIN = "https://appassets.androidplatform.net"
        private const val VIEWPORT_WIDTH = 1080
        private const val VIEWPORT_HEIGHT = 2400
        private const val PAGE_TIMEOUT_MS = 45_000L
        private const val PDF_TIMEOUT_MS = 90_000L
        private const val SETTLE_MS = 1_500L
        private const val POLL_MS = 100L
        private val json = Json { ignoreUnknownKeys = true }

        private const val RUN_EXTRACTION = """
(function () {
  try {
    return JSON.stringify({ ok: true, article: extractArticle(document) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String((e && e.message) || e) });
  }
})();"""
    }
}

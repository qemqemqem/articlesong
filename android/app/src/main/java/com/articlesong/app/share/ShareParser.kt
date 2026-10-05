package com.articlesong.app.share

import android.content.Intent
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** What the user handed us: a page to read, or text to sing directly. */
sealed interface SongSource {
    val titleHint: String?

    data class WebPage(val url: String, override val titleHint: String?) : SongSource

    data class Text(val text: String, val url: String?, override val titleHint: String?) : SongSource {
        val wordCount: Int get() = text.split(WHITESPACE).count { it.isNotEmpty() }
    }
}

private val WHITESPACE = Regex("\\s+")

/**
 * Turns share / text-selection intents into a [SongSource].
 *
 * Browsers share pages as EXTRA_TEXT=url (+ EXTRA_SUBJECT=title). Sharing a highlight from
 * Chrome sends `"quoted text"\nhttps://…#:~:text=…` - the text fragment marks an explicit
 * selection, so we sing that text rather than the whole page.
 */
object ShareParser {
    /** Below this, leftover words next to a URL are a title, not something to sing. */
    const val MIN_TEXT_WORDS = 30
    const val MIN_SELECTION_WORDS = 3

    private val URL = Regex("""https?://[^\s<>"'`]+""", RegexOption.IGNORE_CASE)
    private const val TRAILING_PUNCTUATION = ".,;:!?)]}\"'”’»"
    private const val QUOTES = "\"'“”‘’«» \n\t"

    fun parse(intent: Intent): SongSource? = when (intent.action) {
        Intent.ACTION_PROCESS_TEXT ->
            parseSelection(intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString())
        Intent.ACTION_SEND ->
            parseShare(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT))
        Intent.ACTION_VIEW ->
            intent.dataString?.let { parseShare(it, null) }
        else -> null
    }

    fun parseSelection(text: String?): SongSource.Text? {
        val cleaned = text?.trim(*QUOTES.toCharArray()).orEmpty()
        val source = SongSource.Text(cleaned, url = null, titleHint = null)
        return source.takeIf { it.wordCount >= MIN_SELECTION_WORDS }
    }

    fun parseShare(text: String?, subject: String?): SongSource? {
        val raw = text?.trim().orEmpty()
        val subjectHint = subject?.trim()?.takeIf { it.isNotEmpty() && URL.find(it) == null }
        val match = URL.find(raw)
        if (match == null) {
            return parseSelection(raw)?.copy(titleHint = subjectHint)
        }

        val rawUrl = match.value.trimEnd(*TRAILING_PUNCTUATION.toCharArray())
        val explicitHighlight = rawUrl.contains("#:~:text=")
        val url = cleanUrl(rawUrl) ?: return null
        val leftover = raw.removeRange(match.range).trim(*QUOTES.toCharArray())
        val leftoverWords = leftover.split(WHITESPACE).count { it.isNotEmpty() }

        return if ((explicitHighlight && leftoverWords >= MIN_SELECTION_WORDS) || leftoverWords >= MIN_TEXT_WORDS) {
            SongSource.Text(leftover, url, subjectHint)
        } else {
            SongSource.WebPage(url, subjectHint ?: leftover.takeIf { it.isNotEmpty() })
        }
    }

    /** Drops Chrome's text-fragment directive; rejects anything that isn't a valid http(s) URL. */
    fun cleanUrl(url: String): String? = url.substringBefore("#:~:").toHttpUrlOrNull()?.toString()

    fun siteName(url: String?): String? = url?.toHttpUrlOrNull()?.host?.removePrefix("www.")
}

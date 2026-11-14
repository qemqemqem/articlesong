package com.articlesong.app.api

/**
 * Suno's content filter, the same rules as the add-on's background.js (SUNO CONTENT REJECTIONS).
 *
 * Suno moderates lyrics and style tags (artist/producer names, sensitive words) and fails the task
 * with a message like "Your lyrics contain producer tag ninetythree - we don't reference specific
 * artists...". Those are fixable: rewrite without the offending words and submit again.
 */
object SunoFilter {
    private val REJECTION = Regex(
        "lyrics contain|producer tag|specific artist|sensitive|not allowed|prohibited|copyright|artist name",
        RegexOption.IGNORE_CASE,
    )
    // "producer tag ninetythree" (lyrics), "artist name skank" (style tags)
    private val NAMED = Regex(
        "(?:producer tag|artist name)\\s+[\"'\\u201c\\u2018]?([^\\s\"'\\u201d\\u2019,.;:()]+)",
        RegexOption.IGNORE_CASE,
    )
    private val QUOTED = Regex(
        "(?:contains?|word|term|name|tag|artist)s?\\s*[:\\-]?\\s*[\"'\\u201c\\u2018]([^\"'\\u201d\\u2019]{2,40})[\"'\\u201d\\u2019]",
        RegexOption.IGNORE_CASE,
    )
    private val MULTI_SPACE = Regex("[ \\t]{2,}")
    private val SPACE_BEFORE_PUNCTUATION = Regex(" +([,.!?;:])")
    private val EDGE_SPACE = Regex("^[ \\t]+|[ \\t]+$", RegexOption.MULTILINE)

    /** True when Suno's failure is its content filter (worth a rewrite), not a technical failure. */
    fun isRejection(status: String?, message: String?): Boolean =
        status == "SENSITIVE_WORD_ERROR" || REJECTION.containsMatchIn(message.orEmpty())

    /** The word(s) Suno's message names, lowercase; empty when it doesn't name any. */
    fun flaggedWords(message: String): List<String> {
        val words = LinkedHashSet<String>()
        fun add(word: String) = word.trim().lowercase().takeIf { it.length >= 2 }?.let(words::add)
        NAMED.find(message)?.let { add(it.groupValues[1]) }
        QUOTED.findAll(message).forEach { add(it.groupValues[1]) }
        return words.toList()
    }

    /** Remove the words, tolerating spacing/hyphen variants ("Ninety-Three", "ninety three"). */
    fun scrub(text: String, words: List<String>): String {
        var out = text
        for (word in words) {
            val letters = word.codePoints().toArray()
                .map { String(Character.toChars(it)) }
                .filter { it.isNotBlank() }
                .map(Regex::escape)
            if (letters.isEmpty()) continue
            out = Regex(letters.joinToString("[\\s\\-_.']*"), RegexOption.IGNORE_CASE).replace(out, "")
        }
        out = MULTI_SPACE.replace(out, " ")
        out = SPACE_BEFORE_PUNCTUATION.replace(out, "$1")
        return EDGE_SPACE.replace(out, "")
    }
}

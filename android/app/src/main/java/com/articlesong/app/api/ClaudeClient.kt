package com.articlesong.app.api

import com.anthropic.client.AnthropicClientAsync
import com.anthropic.client.okhttp.AnthropicOkHttpClientAsync
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.NotFoundException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.beta.AnthropicBeta
import com.anthropic.models.beta.messages.BetaFallbacksParam
import com.anthropic.models.beta.messages.BetaMessage
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.BetaThinkingConfigAdaptive
import com.anthropic.models.beta.messages.MessageCreateParams
import com.anthropic.models.models.ModelListParams
import com.articlesong.app.data.CachedModel
import kotlinx.coroutines.future.await

/** Anything that can turn a system prompt + user prompt into text (Claude in production, fakes in tests). */
fun interface LyricsWriter {
    suspend fun complete(system: String, prompt: String, maxTokens: Long, effort: Effort): String
}

enum class Effort(val sdk: BetaOutputConfig.Effort) {
    LOW(BetaOutputConfig.Effort.LOW),
    MEDIUM(BetaOutputConfig.Effort.MEDIUM),
    HIGH(BetaOutputConfig.Effort.HIGH),
}

class ClaudeException(message: String, cause: Throwable? = null) : Exception(message, cause)

interface ModelCache {
    suspend fun get(): CachedModel?
    suspend fun put(model: CachedModel)
}

/**
 * Claude via the official Java SDK, ported from the add-on's claude.js:
 * model ids get retired, so instead of hardcoding one we pick the newest Opus from the
 * account's own /v1/models list, cache it for a day, and re-resolve once if the API says
 * it's gone. A user override (Settings) wins. Failures are never swallowed.
 */
class ClaudeClient(
    apiKey: String,
    private val modelOverride: String,
    private val modelCache: ModelCache,
    baseUrl: String? = null,
    private val now: () -> Long = System::currentTimeMillis,
) : LyricsWriter {
    private val client: AnthropicClientAsync = AnthropicOkHttpClientAsync.builder()
        .apiKey(apiKey)
        .apply { if (baseUrl != null) baseUrl(baseUrl) }
        .maxRetries(2) // the SDK retries 408/409/429/5xx with backoff
        .build()

    /** Models that rejected thinking/effort/fallbacks; we call them with a plain request instead. */
    private val plainModels = mutableSetOf<String>()

    suspend fun resolveModel(forceRefresh: Boolean = false): String {
        if (!forceRefresh) {
            modelOverride.trim().takeIf { it.isNotEmpty() }?.let { return it }
            modelCache.get()?.takeIf { now() - it.fetchedAt < MODEL_CACHE_TTL_MS }?.let { return it.id }
        }
        val models = wrapAuth {
            client.models().list(ModelListParams.builder().limit(100).build()).await().data().map { it.id() }
        }
        return pickBestModel(models).also { modelCache.put(CachedModel(it, now())) }
    }

    override suspend fun complete(system: String, prompt: String, maxTokens: Long, effort: Effort): String {
        var model = resolveModel()
        var refreshedModel = false
        while (true) {
            val plain = model in plainModels
            try {
                val message = wrapAuth {
                    client.beta().messages().create(params(model, system, prompt, maxTokens, effort, plain)).await()
                }
                return extractText(message)
            } catch (e: NotFoundException) {
                if (refreshedModel || !e.mentions("model")) throw e
                refreshedModel = true
                val next = resolveModel(forceRefresh = true)
                if (next == model) throw e
                model = next
            } catch (e: BadRequestException) {
                if (plain || !(e.mentions("thinking") || e.mentions("effort") || e.mentions("fallback"))) throw e
                plainModels += model
            }
        }
    }

    private fun params(
        model: String, system: String, prompt: String, maxTokens: Long, effort: Effort, plain: Boolean,
    ): MessageCreateParams = MessageCreateParams.builder()
        .model(model)
        .maxTokens(maxTokens)
        .system(system)
        .addUserMessage(prompt)
        .apply {
            if (!plain) {
                thinking(BetaThinkingConfigAdaptive.builder().build())
                outputConfig(BetaOutputConfig.builder().effort(effort.sdk).build())
                if (model in FALLBACK_MODELS) {
                    // Route safety-classifier refusals to a fallback model server-side.
                    addBeta(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01)
                    fallbacks(BetaFallbacksParam.ofDefault())
                }
            }
        }
        .build()

    private fun extractText(message: BetaMessage): String {
        if (message.stopReason().orElse(null) == BetaStopReason.REFUSAL) {
            val why = message.stopDetails().flatMap { it.explanation() }.orElse("no reason given")
            throw ClaudeException("Claude declined to write lyrics for this article ($why)")
        }
        return message.content().firstNotNullOfOrNull { block -> block.text().orElse(null)?.text()?.takeIf { it.isNotBlank() } }
            ?.trim()
            ?: throw ClaudeException("Claude returned no text (stop reason: ${message.stopReason().orElse(null)})")
    }

    private suspend fun <T> wrapAuth(block: suspend () -> T): T = try {
        block()
    } catch (e: UnauthorizedException) {
        throw ClaudeException("Anthropic rejected your API key - check it in Settings", e)
    } catch (e: PermissionDeniedException) {
        throw ClaudeException("Your Anthropic API key doesn't have access to this model", e)
    }

    private fun AnthropicServiceException.mentions(word: String): Boolean =
        "${message.orEmpty()} ${body()}".contains(word, ignoreCase = true)

    companion object {
        const val MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000L
        private val FAMILY_PREFERENCE = listOf("opus", "sonnet", "haiku")
        /** Models that accept the server-side `fallbacks: "default"` refusal routing. */
        private val FALLBACK_MODELS = setOf("claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5")

        /** The API lists models newest first; take the newest of the most capable family. */
        fun pickBestModel(ids: List<String>): String {
            for (family in FAMILY_PREFERENCE) ids.firstOrNull { it.contains(family) }?.let { return it }
            return ids.firstOrNull() ?: throw ClaudeException("Anthropic returned no available models for this API key")
        }
    }
}

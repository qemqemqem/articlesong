package com.articlesong.app

import android.content.Context

/** Debug builds: remember API endpoint overrides set by `just fake-backend` (see DebugConfigReceiver). */
object DebugHooks {
    private const val PREFS = "debug_overrides"

    fun install(graph: AppGraph, context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val suno = prefs.getString("suno_base", null) ?: return
        graph.endpoints = ApiEndpoints(suno = suno, anthropic = prefs.getString("anthropic_base", null))
    }

    fun setEndpoints(context: Context, suno: String?, anthropic: String?) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            if (suno.isNullOrBlank()) remove("suno_base") else putString("suno_base", suno)
            if (anthropic.isNullOrBlank()) remove("anthropic_base") else putString("anthropic_base", anthropic)
        }.apply()
        AppGraph.get(context).endpoints = ApiEndpoints(
            suno = suno?.takeIf { it.isNotBlank() } ?: ApiEndpoints().suno,
            anthropic = anthropic?.takeIf { it.isNotBlank() },
        )
    }
}

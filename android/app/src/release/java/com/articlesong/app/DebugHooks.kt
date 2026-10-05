package com.articlesong.app

import android.content.Context

/** Release builds never override endpoints. */
object DebugHooks {
    @Suppress("UNUSED_PARAMETER")
    fun install(graph: AppGraph, context: Context) = Unit
}

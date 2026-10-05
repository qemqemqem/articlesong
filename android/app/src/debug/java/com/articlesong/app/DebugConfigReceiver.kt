package com.articlesong.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.launch

/**
 * Debug builds only.
 *   adb shell am broadcast -a com.articlesong.app.debug.CONFIGURE -p com.articlesong.app.debug \
 *     --es suno_key … --es anthropic_key …            (`just push-keys`)
 *     --es suno_base http://127.0.0.1:8089/ --es anthropic_base http://127.0.0.1:8089   (`just fake-backend`)
 *     --ez reset_endpoints true                        (back to the real APIs)
 */
class DebugConfigReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val graph = AppGraph.get(context)
        val pending = goAsync()
        graph.scope.launch {
            try {
                intent.getStringExtra("suno_key")?.let { graph.settings.setSunoApiKey(it) }
                intent.getStringExtra("anthropic_key")?.let { graph.settings.setAnthropicApiKey(it) }
                if (intent.getBooleanExtra("reset_endpoints", false)) {
                    DebugHooks.setEndpoints(context, null, null)
                } else if (intent.hasExtra("suno_base")) {
                    DebugHooks.setEndpoints(context, intent.getStringExtra("suno_base"), intent.getStringExtra("anthropic_base"))
                }
                Log.i("DebugConfig", "Configured: endpoints=${graph.endpoints}")
                pending.resultData = "ok"
            } finally {
                pending.finish()
            }
        }
    }
}

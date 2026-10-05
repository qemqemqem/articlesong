package com.articlesong.app.ui.components

import androidx.compose.ui.platform.Clipboard

/** Plain text currently on the clipboard, if any. */
suspend fun Clipboard.readText(): String? =
    getClipEntry()?.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text?.toString()

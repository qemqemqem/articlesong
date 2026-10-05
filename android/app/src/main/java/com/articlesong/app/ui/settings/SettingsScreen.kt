package com.articlesong.app.ui.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.articlesong.app.BuildConfig
import com.articlesong.app.data.AppSettings
import com.articlesong.app.data.SettingsStore
import com.articlesong.app.recipe.SongStyle
import com.articlesong.app.ui.AppViewModel
import com.articlesong.app.ui.components.SectionLabel
import com.articlesong.app.ui.components.readText
import com.articlesong.app.ui.theme.Palette
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(settings: AppSettings, vm: AppViewModel, onBack: () -> Unit) {
    var editing by remember { mutableStateOf<Int?>(null) }
    var confirmReset by remember { mutableStateOf(false) }
    val context = LocalContext.current

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding()
            .padding(horizontal = 20.dp).testTag("settings"),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
            Text("Settings", style = MaterialTheme.typography.headlineMedium)
        }

        SectionLabel("API keys", Modifier.padding(top = 8.dp))
        KeyField(
            label = "SunoAPI key",
            value = settings.sunoApiKey,
            onChange = vm::setSunoKey,
            help = "Required - makes the music. Get one at sunoapi.org.",
            helpUrl = "https://sunoapi.org/api-key",
            test = vm::testSuno,
            tag = "sunoKey",
        )
        KeyField(
            label = "Anthropic API key",
            value = settings.anthropicApiKey,
            onChange = vm::setAnthropicKey,
            help = "Optional - Claude writes the lyrics. Without it, Suno writes them.",
            helpUrl = "https://console.anthropic.com/settings/keys",
            test = vm::testClaude,
            tag = "anthropicKey",
        )

        SectionLabel("Generation", Modifier.padding(top = 12.dp))
        Card {
            ModelPicker(settings.sunoModel, vm::setSunoModel)
            var claudeModel by rememberSaveable { mutableStateOf(settings.claudeModelOverride) }
            OutlinedTextField(
                value = claudeModel,
                onValueChange = { claudeModel = it; vm.setClaudeModel(it) },
                label = { Text("Claude model") },
                placeholder = { Text("Auto - newest Opus") },
                supportingText = { Text("Leave blank to use your account's newest Opus model") },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                colors = fieldColors(),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }

        SectionLabel("Playback & downloads", Modifier.padding(top = 12.dp))
        Card {
            Toggle("Auto-play when ready", "Starts playing as soon as Suno can stream it", settings.autoPlay, vm::setAutoPlay)
            Toggle("Save copies to Music", "Also puts each song in Music/ArticleSong for other apps", settings.saveToMusic, vm::setSaveToMusic)
        }

        Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Styles", Modifier.weight(1f))
            TextButton(onClick = { confirmReset = true }) { Text("Reset") }
        }
        Card {
            settings.styles.forEachIndexed { index, style ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { editing = index }.padding(vertical = 10.dp, horizontal = 4.dp)) {
                    Text(style.name, style = MaterialTheme.typography.titleSmall)
                    Text(
                        style.description.removePrefix("Style: "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.TextTertiary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Text(
            "ArticleSong ${BuildConfig.VERSION_NAME} · prompts and styles are shared with the ArticleSong browser add-on.",
            style = MaterialTheme.typography.bodySmall,
            color = Palette.TextTertiary,
            modifier = Modifier.padding(vertical = 24.dp).clickable {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://sunoapi.org")))
            },
        )
    }

    editing?.let { index ->
        StyleEditor(settings.styles[index], onDismiss = { editing = null }) { name, description ->
            vm.updateStyle(index, name, description)
            editing = null
        }
    }
    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset styles?") },
            text = { Text("All six styles go back to the add-on's defaults.") },
            confirmButton = { TextButton(onClick = { vm.resetStyles(); confirmReset = false }) { Text("Reset") } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Palette.Card).padding(14.dp)) { content() }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Palette.Outline, focusedBorderColor = Palette.Violet)

@Composable
private fun KeyField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    help: String,
    helpUrl: String,
    test: suspend () -> Result<String>,
    tag: String,
) {
    var result by remember { mutableStateOf<Result<String>?>(null) }
    // The field owns its text while on screen. Re-reading the stored value on every change would let
    // late echoes of our own writes clobber fast typing.
    var text by rememberSaveable(label) { mutableStateOf(value) }
    val write: (String) -> Unit = { new ->
        text = new.trim()
        result = null
        onChange(new)
    }
    var visible by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboard.current
    val context = LocalContext.current

    Card {
        OutlinedTextField(
            value = text,
            onValueChange = write,
            label = { Text(label) },
            singleLine = true,
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                Row {
                    IconButton(onClick = { visible = !visible }) {
                        Icon(if (visible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, if (visible) "Hide" else "Show")
                    }
                    IconButton(onClick = { scope.launch { clipboard.readText()?.let(write) } }) {
                        Icon(Icons.Rounded.ContentPaste, "Paste")
                    }
                }
            },
            shape = RoundedCornerShape(14.dp),
            colors = fieldColors(),
            modifier = Modifier.fillMaxWidth().testTag(tag),
        )
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                help,
                style = MaterialTheme.typography.bodySmall,
                color = Palette.TextSecondary,
                modifier = Modifier.weight(1f).clickable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(helpUrl))) },
            )
            TextButton(
                enabled = text.isNotBlank() && !testing,
                onClick = {
                    testing = true
                    scope.launch {
                        result = test()
                        testing = false
                    }
                },
                modifier = Modifier.testTag("$tag-test"),
            ) { Text(if (testing) "Testing…" else "Test") }
        }
        result?.let { r ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.testTag("$tag-result")) {
                Icon(
                    if (r.isSuccess) Icons.Rounded.CheckCircle else Icons.Rounded.ErrorOutline, null,
                    tint = if (r.isSuccess) Palette.Success else Palette.Error,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    r.getOrNull() ?: r.exceptionOrNull()?.let { it.message ?: it::class.java.simpleName } ?: "Failed",
                    modifier = Modifier.padding(start = 6.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (r.isSuccess) Palette.Success else Palette.Error,
                )
            }
        }
    }
}

@Composable
private fun ModelPicker(model: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { open = true }.padding(vertical = 10.dp, horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Suno model", style = MaterialTheme.typography.titleSmall)
                Text("V6 is the current default", style = MaterialTheme.typography.bodySmall, color = Palette.TextTertiary)
            }
            Text(model, style = MaterialTheme.typography.titleSmall, color = Palette.Violet)
        }
        DropdownMenu(open, onDismissRequest = { open = false }) {
            SettingsStore.SUNO_MODELS.forEach { option ->
                DropdownMenuItem(text = { Text(option) }, onClick = { onSelect(option); open = false })
            }
        }
    }
}

@Composable
private fun Toggle(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 8.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Palette.TextTertiary)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Palette.Violet,
                uncheckedThumbColor = Palette.TextSecondary,
                uncheckedTrackColor = Palette.CardHigh,
                uncheckedBorderColor = Palette.Outline,
            ),
        )
    }
}

@Composable
private fun StyleEditor(style: SongStyle, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var name by rememberSaveable { mutableStateOf(style.name) }
    var description by rememberSaveable { mutableStateOf(style.description) }
    // Same validation as the add-on's style editor
    val error = when {
        name.isBlank() -> "Name is required"
        name.length > 30 -> "Name too long (max 30 characters)"
        description.trim().length < 20 -> "Description too short (minimum 20 characters)"
        description.length > 2000 -> "Description too long (max 2000 characters)"
        else -> null
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit style") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, colors = fieldColors(), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    description, { description = it },
                    label = { Text("Creative direction") },
                    minLines = 4, maxLines = 8,
                    colors = fieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.Error) }
            }
        },
        confirmButton = { TextButton(enabled = error == null, onClick = { onSave(name, description) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

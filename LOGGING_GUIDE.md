# 📝 Logging System Guide

The extension has a **comprehensive logging system** for development and debugging!

## 🎯 How It Works

All activity is logged to:
1. **Browser Console** (Ctrl+Shift+J) - Real-time logs
2. **Persistent Storage** (survives browser restarts)
3. **Debug Page** (view all logs in one nice UI)
4. **Auto-saved File** (optional, for development only)

## 📁 **Optional: Log File Output** (Development Mode)

By default, automatic file downloads are **DISABLED** for production use.

### Enabling Development Mode:

To enable automatic log file downloads:
1. Edit `add-on/logger.js`
2. Find the `init()` method
3. Uncomment the line: `this.startAutoSave();`
4. Find the `_addLog()` method
5. Uncomment the error/success file write section
6. Reload the extension

Logs will then save to: `~/Downloads/article-song-debug.log`

### Quick Read (Terminal):
```bash
# Option 1: Use the helper script
./read-logs.sh

# Option 2: Read directly
cat ~/Downloads/article-song-debug.log

# Option 3: Watch in real-time
watch -n 2 cat ~/Downloads/article-song-debug.log
```

**When enabled, file updates:**
- ✅ Every 10 seconds automatically
- ✅ Immediately after errors or successes
- ✅ Overwrites previous file (no clutter!)

---

## 🔍 Other Ways to View Logs

### Option 1: Debug Page
```
1. Load extension
2. Go to: about:debugging → This Firefox
3. Find extension, click "Inspect"
4. In console, type: window.location = "debug.html"
```

Shows nice UI with:
- Color-coded logs
- Auto-refresh every 2 seconds
- Export/copy/clear buttons

### Option 2: Browser Console
```
Press: Ctrl+Shift+J
```

Real-time logs as they happen.

---

## 📊 What Gets Logged

### Extension Startup
```
✅ Article Song extension loaded!
✅ API keys loaded { anthropic: '✓', suno: '✓' }
✅ Background script ready!
```

### Song Generation Flow
```
ℹ️ Starting song generation: musical
   { pageTitle, textLength, articlePreview }

ℹ️ Generating musical lyrics...
✅ Lyrics generated (XXX chars)
   { preview: "..." }

ℹ️ Generating style tags...
✅ Style tags generated: "pop, upbeat"

ℹ️ Sending to Suno API...
✅ Suno task started: task_abc123

🔍 Checking Suno status...
✅ Song ready!
✅ SONG GENERATION COMPLETE!
   { audioUrl, title, lyrics, style }
```

### Errors (with full details)
```
❌ Anthropic API key not configured
❌ Song generation failed
   { error, stack, songStyle, pageTitle }
```

---

## 🐛 Debugging Flow

### For Users:
1. Load extension
2. Try to generate a song
3. If it fails:
   - Check browser console (Ctrl+Shift+J)
   - Or open Debug page (Options → Debug Logs)
   - Logs persist in browser storage

### For Development (with log files enabled):
```bash
# Read the auto-generated log file:
cat ~/Downloads/article-song-debug.log

# Watch in real-time:
watch -n 2 cat ~/Downloads/article-song-debug.log
```

Logs include:
- Exact API calls made
- Full error messages with stack traces
- Request/response data
- Timing of each step

---

## 🎨 Log Levels

- **ℹ️ info**: General information
- **✅ success**: Successful operations
- **⚠️ warning**: Warning messages  
- **❌ error**: Error messages
- **🔍 debug**: Debug/detailed info

*Note: In development mode (file output enabled), errors and successes write immediately to file*

---

## 💡 Tips

1. **Use Debug Page for quick viewing** - Nice UI, auto-refresh
   - Options → Debug Logs

2. **Browser Console for real-time** - Best for active debugging
   - Ctrl+Shift+J

3. **Enable file mode for AI debugging** - Uncomment in logger.js
   - Useful when AI needs to read logs remotely

4. **Logs persist** - Survives browser restarts (stored in browser.storage.local)

---

## 🚀 Benefits

### For Users:
- ✅ No automatic file downloads cluttering your system
- ✅ Logs available in browser console and debug page
- ✅ Persistent storage survives browser restarts
- ✅ Easy to enable file mode for development

### For Developers:
- ✅ Enable file mode when needed
- ✅ Full context for debugging
- ✅ Structured, parseable format
- ✅ Real-time or historical logs available

---

**Production Mode (Default):**
- Logs to console + browser storage only
- No automatic file downloads
- Clean and non-intrusive

**Development Mode (Optional):**
- Enable in `logger.js` for automatic file downloads
- Useful for AI-assisted debugging
- Easy to toggle on/off

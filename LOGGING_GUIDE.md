# 📝 Logging System Guide

The extension now has a **comprehensive logging system** with automatic file output!

## 🎯 How It Works

All activity is logged to:
1. **Browser Console** (Ctrl+Shift+J)
2. **Persistent Storage** (survives browser restarts)
3. **Auto-saved File** - `~/Downloads/article-song-debug.log` ✨ **NEW!**
4. **Debug Page** (view all logs in one place)

## 📁 **BEST: Read the Log File** (For AI)

The extension **automatically writes logs** to:
```
~/Downloads/article-song-debug.log
```

### Quick Read (Terminal):
```bash
# Option 1: Use the helper script
./read-logs.sh

# Option 2: Read directly
cat ~/Downloads/article-song-debug.log

# Option 3: Watch in real-time
watch -n 2 cat ~/Downloads/article-song-debug.log
```

### For AI to Read:
```bash
# I can read the file anytime with:
read_file ~/Downloads/article-song-debug.log
```

**File updates:**
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

### For You:
1. Load extension
2. Try to generate a song
3. If it fails, just share: `~/Downloads/article-song-debug.log`

### For Me (AI):
```bash
# I can read the log file anytime:
read_file ~/Downloads/article-song-debug.log

# Then I can see:
# - Exact API calls made
# - Full error messages with stack traces
# - Request/response data
# - Timing of each step
```

---

## 🎨 Log Levels

- **ℹ️ info**: General information
- **✅ success**: Successful operations (writes immediately to file!)
- **⚠️ warning**: Warning messages  
- **❌ error**: Error messages (writes immediately to file!)
- **🔍 debug**: Debug/detailed info

---

## 💡 Tips

1. **Check the file first** - Fastest way to debug
   ```bash
   cat ~/Downloads/article-song-debug.log
   ```

2. **Watch in real-time** - See logs as they happen
   ```bash
   watch -n 1 cat ~/Downloads/article-song-debug.log
   ```

3. **File updates automatically** - No manual export needed!

4. **Errors write immediately** - Don't wait 10 seconds for critical errors

---

## 🚀 Benefits

### For You:
- ✅ No manual export needed
- ✅ Just share one file
- ✅ Always up-to-date

### For AI (Me):
- ✅ Can read logs anytime
- ✅ No user interaction needed
- ✅ Full context for debugging
- ✅ Structured, parseable format

---

**Now I can debug without asking you to export logs!** 🎉

Just run the extension, and I can read `~/Downloads/article-song-debug.log` anytime!

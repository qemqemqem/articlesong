# Article Song

A browser extension that converts articles into songs using AI!

## 🎵 What It Does

1. Click the extension button on any webpage
2. Extension extracts the article text
3. AI generates custom lyrics based on the content (Claude or SunoAPI)
4. Suno AI creates a song from those lyrics
5. Audio plays directly in your browser!

## 🏗️ Architecture (v2.0 - Browser-Only)

**No Python backend needed!** Everything runs in the browser extension:

```
Article Text → Lyrics AI (Claude or SunoAPI) → SunoAPI.org (music) → Audio Player
```

## ⚙️ Setup

### 1. Get Your API Keys

**Required:**

**SunoAPI Key** (for music generation):
- Go to https://sunoapi.org/pricing
- Sign up and get your API key
- Cost: ~$0.02 per song (includes lyrics generation if used)

**Optional:**

**Anthropic API Key** (for Claude lyrics):
- Go to https://console.anthropic.com/
- Create an account and get your API key
- Cost: ~$0.01-0.05 per song (lyrics generation)
- **If not set, SunoAPI will generate lyrics instead**

**Total cost per song:**
- With SunoAPI only: ~$0.02 ✅
- With Claude + SunoAPI: ~$0.03-0.07 ✅✅ (better quality lyrics)

### 2. Install the Extension

**Firefox:**
1. Open Firefox
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `add-on/manifest.json`

**Chrome** (if you update to Manifest V3):
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `add-on/` folder

### 3. Configure API Keys

1. Click the extension options (right-click extension icon → Options)
2. Paste your SunoAPI key (required)
3. Optionally paste your Anthropic API key (for better lyrics quality)
4. Click "Save Settings"

**Note:** If you don't set the Anthropic key, the extension will use SunoAPI's lyrics generation endpoint instead. This works well but Claude tends to produce more refined, article-specific lyrics.

## 🎤 Song Styles

Choose from the context menu (right-click extension button):

- **Musical Song** (default) - Traditional song structure with verses and chorus
- **Spoken Word** - Rhythmic spoken-word style
- **Meme Song** - Humorous and viral-worthy
- **Cute Song** - Light-hearted and positive
- **Informative Song** - Educational, fact-focused
- **Use Page Text as Lyrics** - Uses article text directly (no AI rewriting)

## 📁 Project Structure

```
add-on/
├── manifest.json       # Extension configuration
├── background.js       # Main logic (API calls, orchestration)
├── prompts.js          # Battle-tested prompts for lyrics generation
├── logger.js           # Persistent logging system
├── content_script.js   # Page interaction and audio playback
├── options.html/js     # Settings page for API keys
├── debug.html/js       # Real-time log viewer
├── Readability.js      # Article text extraction library
└── icons/              # Extension icons

old-python-backend/     # Archived Python version (for reference)
```

## 🚀 Usage

### Quick Start:
1. Navigate to any article (Wikipedia, blog post, news site, etc.)
2. Click the Article Song extension button
3. Wait ~2-4 minutes (V5 takes longer but sounds amazing!)
4. Song plays automatically!

### Custom Song Style:
1. Right-click the extension button
2. Choose song style from menu
3. Wait for generation
4. Enjoy your custom song!

## 💰 Cost Comparison

| Version | Cost per Song | Setup Complexity | Shareability |
|---------|---------------|------------------|--------------|
| **v2.0 (Current)** | $0.02-0.07 | Low (1-2 API keys) | ✅ Easy |
| v1.0 (Python + PIAPI) | $15/mo + credits | High (Python + native messaging) | ❌ Hard |

## 🛠️ Development

### Debugging

**Option 1: Debug Page (Recommended)**
1. Right-click extension → Manage Extension → Options
2. Click "Debug Logs" link
3. See real-time logs as you use the extension

**Option 2: Browser Console**
1. Open Browser Console (Ctrl+Shift+J)
2. All API calls and state changes are logged

**Option 3: Log File (Development Mode)**
- By default, logs stay in browser storage (no file downloads)
- To enable automatic log file downloads during development:
  - Edit `add-on/logger.js`
  - Uncomment the marked sections in `init()` and `_addLog()`
- Logs will then save to `~/Downloads/article-song-debug.log`

## 📝 What Changed from v1.0?

### Removed:
- ❌ Python backend (`app/`)
- ❌ Native messaging setup
- ❌ PIAPI dependency
- ❌ Complex installation process

### Added:
- ✅ Direct API calls from browser
- ✅ SunoAPI.org integration (proven 100% uptime)
- ✅ Simplified setup (just 2 API keys)
- ✅ Better error handling and logging
- ✅ Easier to share with friends!

## 🐛 Troubleshooting

### "SunoAPI key not configured"
- Go to extension options and enter your SunoAPI key (required)

### "Anthropic API error: 401"
- Your Anthropic API key is invalid or expired
- Get a new one from console.anthropic.com
- Or leave it empty to use SunoAPI lyrics generation

### "Suno API error: 402"
- You need to add credits to your SunoAPI account
- Go to sunoapi.org and top up

### Song takes too long
- Normal generation time is 2-4 minutes for V5 (high quality!)
- If it times out (8 minutes), check your SunoAPI credits

### Audio doesn't play
- Check browser console for errors
- Make sure you're on a valid article page (not a PDF or image)
- Try reloading the page and clicking the extension again

## 🎯 Sharing with Friends

Friends can use this extension easily:
1. Send them the `add-on/` folder (or GitHub link)
2. They load it in Firefox
3. They get a SunoAPI key (required, 2 minutes)
4. Optionally get Anthropic key for better lyrics (3 minutes)
5. Done!

No Python, no native messaging, no complex setup. Just works! ✨

## 📚 Old Python Backend

The original Python backend is archived in `old-python-backend/` for reference. It contains the original prompts and logic that we ported to JavaScript.

## 🏆 Credits

- **Readability.js** - Mozilla's article extraction library
- **Claude (Anthropic)** - Lyrics generation (optional)
- **Suno AI** (via SunoAPI.org) - Music generation & lyrics fallback

---

**Stay the course!** 🎸

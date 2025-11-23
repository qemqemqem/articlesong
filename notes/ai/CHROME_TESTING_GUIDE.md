# Chrome Testing Guide - Manifest V3

**Status:** Development logging ENABLED ✅  
**Branch:** chrome-ext

---

## 🔧 Loading Extension in Chrome

### Step 1: Open Chrome Extensions Page
```
chrome://extensions/
```

### Step 2: Enable Developer Mode
- Toggle "Developer mode" (top right)

### Step 3: Load Unpacked Extension
1. Click "Load unpacked"
2. Select: `/home/keenan/Dev/articlesong/add-on-chrome/`
3. Extension should appear in the list

### Step 4: Pin the Extension
- Click the puzzle icon (extensions menu)
- Pin "Turn articles into songs!"

---

## 📝 Viewing Logs (3 Ways)

### Method 1: Auto-saved Log File (RECOMMENDED)
**Logs save to:** `~/Downloads/article-song-debug.log`

```bash
# Read logs
./read-logs-chrome.sh

# OR read directly
cat ~/Downloads/article-song-debug.log

# Watch live (updates every 2 seconds)
watch -n 2 cat ~/Downloads/article-song-debug.log
```

**Updates:**
- ✅ Every 10 seconds automatically
- ✅ Immediately after errors or successes
- ✅ Overwrites previous file (no clutter!)

### Method 2: Service Worker Console
1. Go to `chrome://extensions/`
2. Find "Turn articles into songs!"
3. Click **"service worker"** (blue link)
4. Opens DevTools with background script console
5. Real-time logs appear here

**Important:** Service worker will show as "inactive" when idle. That's normal!

### Method 3: Debug Page
1. Open Service Worker DevTools (see above)
2. In console, type: `chrome.runtime.getURL('debug.html')`
3. Copy the URL
4. Open in new tab
5. Nice UI with color-coded logs, auto-refresh, export buttons

---

## 🎯 What to Test

### Critical Path Tests

#### 1. **Song Generation (Full Flow)**
1. Navigate to any article (e.g., Wikipedia)
2. Click extension icon
3. Click "Generate Song"
4. Watch status updates in popup
5. Audio should start playing in ~30-40 seconds

**Expected log entries:**
```
✅ Article Song Background Script LOADED!
ℹ️ Received createSong message from popup
ℹ️ Starting "Indie Rock" song generation
✅ Lyrics generated successfully
ℹ️ Submitting to Suno...
🔍 Poll attempt 1/96
🎵 Streaming URL ready! Starting playback...
✅ Song ready: [song title]
```

#### 2. **Service Worker Restart (CRITICAL)**
This tests if the extension survives service worker termination:

1. Start generating a song
2. Open `chrome://extensions/`
3. Find your extension
4. Click the **"service worker"** link (opens DevTools)
5. In the Service Workers pane, click **"Stop"** 
6. Wait 10 seconds
7. Open popup again
8. Check status - should show correct progress
9. Song should complete normally

**What should happen:**
- ✅ Worker restarts automatically
- ✅ State reloads from storage
- ✅ Polling continues (async loop keeps worker alive)
- ✅ No lost requests

**If it fails:**
- ❌ State lost (empty requests)
- ❌ Polling stopped
- ❌ Extension broken until reload

#### 3. **Multiple Concurrent Requests**
1. Open 3 different article tabs
2. Generate songs on all 3 quickly
3. All should process concurrently
4. Check popup - should show all 3

#### 4. **Cancellation**
1. Start generating a song
2. Open popup
3. Click ❌ to cancel
4. Status should change to "Cancelled"

#### 5. **Download**
1. Complete a song generation
2. Click download button in popup
3. MP3 should save to Downloads folder

#### 6. **API Keys (Options Page)**
1. Click extension icon → Settings
2. Enter API keys
3. Save
4. Reload extension
5. Keys should persist

---

## 🐛 Common Issues to Watch For

### Issue 1: Service Worker Terminates Mid-Generation
**Symptom:** Song generation stops, status stuck  
**Check logs for:** 
```
❌ Failed to poll status
❌ Request lost
```
**Fix:** State persistence needs work

### Issue 2: importScripts Fails
**Symptom:** Extension doesn't load at all  
**Check logs for:**
```
❌ Failed to load script
```
**Fix:** Check manifest.json service_worker path

### Issue 3: Alarms Not Working
**Symptom:** Auto-save doesn't happen every 10 seconds  
**Check logs for:**
```
ℹ️ Auto-save started
```
**Fix:** Check chrome.alarms API permissions

### Issue 4: Polling Doesn't Resume
**Symptom:** After service worker restart, polling stops  
**Check logs for:**
```
ℹ️ State reloaded
🔍 Poll attempt X/96
```
**Fix:** Async loop or ensureStateLoaded issue

### Issue 5: API Calls Fail
**Symptom:** 401/403 errors from Anthropic or SunoAPI  
**Check logs for:**
```
❌ HTTP error: 401
❌ API key not found
```
**Fix:** host_permissions in manifest.json

---

## 🔍 Debugging Tips

### Service Worker DevTools
```
chrome://extensions/
→ Click "service worker" (blue link)
→ Real-time console logs
→ Can inspect variables
→ See network requests
```

### Force Service Worker Restart
```
chrome://extensions/
→ Click "service worker"
→ In DevTools, click "Stop"
→ Wait a few seconds
→ Worker restarts on next action
```

### Check Alarms
```
In service worker console:
chrome.alarms.getAll(alarms => console.log(alarms))
```

### Check Storage
```
In service worker console:
chrome.storage.local.get(null, data => console.log(data))
```

### Network Requests
```
Service Worker DevTools → Network tab
→ See all API calls
→ Check status codes
→ Inspect request/response
```

---

## 📊 Testing Checklist

### Core Functionality
- [ ] Song generation completes
- [ ] Streaming starts in ~30 seconds
- [ ] Popup UI updates in real-time
- [ ] Lyrics generation (SunoAPI)
- [ ] Lyrics generation (Anthropic - optional)
- [ ] Custom style descriptions
- [ ] Multiple concurrent requests
- [ ] Cancellation works
- [ ] Download MP3
- [ ] Retry failed requests

### Service Worker Resilience
- [ ] Extension loads without errors
- [ ] Background script starts
- [ ] Survives service worker restart mid-generation
- [ ] State persists across restarts
- [ ] Alarms fire correctly
- [ ] Polling resumes after restart

### UI/UX
- [ ] Popup displays correctly
- [ ] Options page saves API keys
- [ ] Notifications appear (if enabled)
- [ ] Context menus work
- [ ] Badge updates

### Edge Cases
- [ ] No API keys configured (shows error)
- [ ] Invalid API keys (shows error)
- [ ] Network timeout
- [ ] Very long articles
- [ ] Very short articles
- [ ] Selected text vs. full page

---

## 🚨 Error Patterns to Look For

### In Logs:
```bash
# Good signs:
✅ API keys loaded
✅ Background script ready!
🔍 Poll attempt X/96
✅ Song ready

# Bad signs:
❌ Failed to load
❌ API key not found
❌ Uncaught error
❌ Service worker terminated unexpectedly
```

### In Chrome Console:
```javascript
// Good:
"Service worker started"
"Background script loaded"

// Bad:
"Uncaught ReferenceError"
"Service worker failed to start"
"Invalid manifest"
```

---

## 💪 If Things Break

### 1. Check the Log File
```bash
./read-logs-chrome.sh
```

### 2. Check Service Worker Console
```
chrome://extensions/ → service worker
```

### 3. Reload Extension
```
chrome://extensions/ → Click reload icon
```

### 4. Check Manifest Errors
```
chrome://extensions/
→ Look for red "Errors" button
```

### 5. Clear Storage
```javascript
// In service worker console:
chrome.storage.local.clear()
chrome.storage.sync.clear()
```

---

## 🎵 Happy Path Example

```
1. Load extension ✅
2. Navigate to article ✅
3. Click extension icon ✅
4. Click "Generate Song" ✅
5. Status: "Generating lyrics..." ✅
6. Status: "Creating music..." ✅
7. Status: "Song streaming!" 🎵
8. Audio plays in page ✅
9. Status: "Ready for download" ✅
10. Click download ✅
11. MP3 in Downloads folder ✅
```

**Expected logs:**
```
✅ Article Song Background Script LOADED!
✅ API keys loaded
ℹ️ Starting song generation
✅ Lyrics generated
ℹ️ Submitting to Suno
🔍 Polling status...
🎵 Streaming URL ready!
✅ Song complete
```

---

## 🔄 Quick Reload Workflow

```bash
# Make a code change
# Then:

# Method 1: Click reload in chrome://extensions/

# Method 2: Use keyboard shortcut (if configured)
# Ctrl+R in chrome://extensions/

# Method 3: Programmatic reload (add to dev tools)
chrome.runtime.reload()
```

---

## 📝 Notes

- **Service worker goes "inactive"** when idle - this is NORMAL! It restarts on next action.
- **Logs auto-save every 10 seconds** - check Downloads folder
- **Use `watch` command** for live log monitoring during testing
- **Test service worker restart** - this is the #1 V3 gotcha!

---

**Ready to test? Load it up and let's hunt down those bugs! 🏹**


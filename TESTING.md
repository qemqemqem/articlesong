# 🧪 Testing the Rebuilt Extension

## ✅ What We Just Did

**MASSIVE REBUILD** - Went from Python backend + PIAPI to pure browser extension with SunoAPI.org!

### Changes:
1. ❌ Deleted Python backend (`app/article_singer.py`, etc.)
2. ❌ Removed native messaging dependency
3. ❌ Removed PIAPI integration
4. ✅ Added SunoAPI.org integration
5. ✅ Ported all prompts to JavaScript (`prompts.js`)
6. ✅ Rewrote `background.js` with direct API calls
7. ✅ Updated options UI for new API keys
8. ✅ Updated manifest (removed `nativeMessaging` permission)

## 🎯 Quick Test

### Prerequisites:
1. Get Anthropic API key from https://console.anthropic.com/
2. Get SunoAPI key from https://sunoapi.org/

### Steps:

#### 1. Load the Extension
```
Firefox → about:debugging#/runtime/this-firefox
→ "Load Temporary Add-on"
→ Select: add-on/manifest.json
```

#### 2. Configure API Keys
```
Right-click extension icon → Options
→ Paste Anthropic API key
→ Paste SunoAPI key
→ Save Settings
```

#### 3. Test on a Simple Page
```
1. Go to: https://en.wikipedia.org/wiki/Music
2. Click the extension button
3. Open Browser Console (Ctrl+Shift+J)
4. Watch the logs!
```

### Expected Console Output:
```
🎵 Article Song extension loaded!
✅ API keys loaded { anthropic: '✓', suno: '✓' }
═══════════════════════════════════════════════════════
🎯 Starting song generation: musical
📄 Article: "Music - Wikipedia"
📏 Text length: XXXX chars
🎤 Generating musical lyrics...
✅ Lyrics generated (XXX chars)
🎨 Generating style tags...
✅ Style tags generated: "..."
🎵 Sending to Suno API...
✅ Suno task started: task_XXXXX
🔍 Checking Suno status...
🔍 Checking Suno status...
✅ Song ready: Music - Wikipedia
✅ SONG GENERATION COMPLETE!
🎵 URL: https://...
═══════════════════════════════════════════════════════
```

### Expected Behavior:
1. ⏱️ **30-60 seconds** generation time
2. 🔊 Audio player appears at top of page
3. 🎵 Song plays automatically
4. 📥 Song downloads after 4 minutes

## 🐛 Common Issues

### Issue: "API key not configured"
**Fix:** Open options page and enter both API keys

### Issue: "Anthropic API error: 401"
**Fix:** Invalid Anthropic key - get a new one

### Issue: "Suno API error: 402"
**Fix:** Need to add credits to SunoAPI account

### Issue: "ReferenceError: getLyricsPrompt is not defined"
**Fix:** Make sure `prompts.js` is loaded before `background.js` in manifest

### Issue: No audio plays
**Check:**
1. Browser console for errors
2. Content script loaded? (should see message on page load)
3. CORS errors? (extensions should bypass CORS)

## 🔬 Advanced Testing

### Test Different Song Styles:
```
1. Right-click extension button
2. Choose each style:
   - Musical Song
   - Spoken Word
   - Meme Song
   - Cute Song
   - Informative Song
   - Use Page Text as Lyrics
3. Verify lyrics match the style
```

### Test Error Handling:
```
1. Remove API keys from options
2. Click extension → should show error notification
3. Re-add keys → should work again
```

### Test on Different Pages:
- ✅ Wikipedia articles
- ✅ Blog posts
- ✅ News articles
- ✅ Documentation pages
- ❌ PDFs (won't work - no DOM)
- ❌ Images (won't work - no text)

## 📊 Success Criteria

✅ Extension loads without errors
✅ Options page shows and saves API keys
✅ Clicking extension button starts generation
✅ Browser console shows progress logs
✅ Song completes in 30-60 seconds
✅ Audio plays automatically
✅ Badge shows elapsed time
✅ Tooltip shows current state
✅ Different song styles produce different results

## 🎉 If It All Works

**YOU'VE SUCCESSFULLY REBUILT THE EXTENSION!**

Now you can:
- Share it with friends (just send them the `add-on/` folder)
- They get their own API keys (5 minutes)
- No Python installation needed
- No native messaging setup
- Just works! ✨

## 🔄 Next Steps

If testing succeeds:
1. Commit to Git
2. Tag as v2.0
3. Share with friends!
4. Consider publishing to addons.mozilla.org

If testing fails:
1. Check console for specific errors
2. Verify API keys are valid
3. Check network tab for failed requests
4. Share error messages for debugging

---

**The code is ready. Time to test!** 🚀


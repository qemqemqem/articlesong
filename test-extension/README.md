# 🎯 Minimal Suno Test Extension

**Purpose:** Prove that browser extensions can bypass CORS and call Suno API directly with cookies.

## What It Does

Click button → Sends hardcoded request to Suno → Logs everything → Shows notification

**Test Request:** "A folk punk song about baking"

## How To Test

### Step 1: Load the Extension

**In Firefox:**
1. Open Firefox
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on"**
4. Navigate to this folder and select `manifest.json`
5. Extension loads!

### Step 2: Make Sure You're Logged Into Suno
1. Open a new tab
2. Go to `https://app.suno.ai`
3. Make sure you're logged in

### Step 3: Open Browser Console
1. Press `Ctrl+Shift+J` (or `Cmd+Shift+J` on Mac)
2. This opens the **Browser Console** (not the page console!)
3. You should see: "🎵 Suno Test Extension loaded!"

### Step 4: Click The Extension Button
1. Look for the extension icon in your toolbar (top right)
2. Click it!
3. Watch the Browser Console

## What To Look For

### ✅ Success (Status 200/201):
```
✅✅✅ SUCCESS! ✅✅✅
🎉 Direct Suno API works from browser extension!
💡 CORS was bypassed successfully!
🚀 Browser-only extension is VIABLE!
```
**Meaning:** We can build the full browser-only extension! 🎉

### ⚠️ Need Credits (Status 402):
```
⚠️  402 Payment Required
💡 Your Suno account needs credits
   → But the API itself WORKS!
```
**Meaning:** API works! Just add credits to Suno account and retry.

### ⚠️ Not Logged In (Status 401):
```
⚠️  401 Unauthorized
💡 You might not be logged into Suno
```
**Meaning:** Go to app.suno.ai and log in, then try again.

### ❌ Blocked (Status 403):
```
❌ 403 Forbidden
💡 Suno might be blocking this approach
```
**Meaning:** Suno is actively blocking this. Need different strategy.

### ⚠️ Server Busy (Status 503):
```
⚠️  503 Service Unavailable
💡 Suno servers might be busy
```
**Meaning:** Just wait a moment and try again.

## Files

```
test-extension/
├── manifest.json       # Extension config with permissions
├── background.js       # Main logic - makes the API call
├── icon.png           # Extension icon
└── README.md          # This file
```

## Key Technical Details

### Permissions in manifest.json:
- `cookies` - Access to read cookies
- `https://studio-api.suno.ai/*` - Permission to call Suno API
- `https://app.suno.ai/*` - Permission to read Suno cookies

### Background Script:
- Runs in privileged extension context
- **Bypasses CORS** (this is the key!)
- Automatically includes cookies in requests
- Logs everything for debugging

## Next Steps Based on Results

### If It Works ✅
1. Build full extension with:
   - Article text extraction
   - Claude API for lyrics generation
   - Full Suno integration
   - Audio playback
2. Remove Python backend completely
3. Share with friends!

### If It Fails ❌
1. Analyze the specific error
2. Try adjusting permissions
3. Consider alternative approaches
4. Or fall back to Python + PIAPI

---

**This is the moment of truth!** 🎯

Run the test and tell me what happens!


# Manifest V3 Migration Guide for Chrome Web Store

## Overview

Chrome requires Manifest V3. This guide outlines all changes needed to migrate from V2 → V3.

**Estimated Effort:** Medium-High (3-5 hours)  
**Difficulty:** The background script → service worker migration is the hardest part  
**Testing:** Critical - service workers behave very differently from background scripts

---

## Core Architecture Change

**V2:** Persistent background page runs continuously  
**V3:** Service worker that can be terminated at any time by Chrome

**Impact:** This is the BIG change. Service workers:
- ❌ No `document`, no `window`, no DOM
- ❌ Can't use `setInterval` or `setTimeout` reliably for long tasks
- ❌ Can be terminated mid-execution and restarted
- ✅ Must use `chrome.alarms` API for periodic tasks
- ✅ Must persist all state to storage
- ✅ Must use `importScripts()` to load dependencies

---

## 1. Manifest.json Changes

### Change 1: Update manifest_version

```json
{
  "manifest_version": 3,
  "name": "Turn articles into songs!",
  "version": "1.0",
  "description": "Sing your articles!"
}
```

### Change 2: Background Scripts → Service Worker

**Before (V2):**
```json
"background": {
  "scripts": ["logger.js", "prompts.js", "background.js"]
}
```

**After (V3):**
```json
"background": {
  "service_worker": "background.js",
  "type": "module"
}
```

**Impact:**
- Only ONE file allowed (no array of scripts)
- Must use `importScripts()` to load other files
- Or convert to ES6 modules (set `"type": "module"`)

### Change 3: browser_action → action

**Before (V2):**
```json
"browser_action": {
  "default_icon": "icons/glitch_note.png",
  "default_popup": "popup.html"
}
```

**After (V3):**
```json
"action": {
  "default_icon": "icons/glitch_note.png",
  "default_popup": "popup.html"
}
```

### Change 4: Move API URLs to host_permissions

**Before (V2):**
```json
"permissions": [
  "activeTab",
  "downloads",
  "menus",
  "notifications",
  "storage",
  "https://api.anthropic.com/*",
  "https://api.sunoapi.org/*"
]
```

**After (V3):**
```json
"permissions": [
  "activeTab",
  "downloads",
  "alarms",
  "storage"
],
"host_permissions": [
  "https://api.anthropic.com/*",
  "https://api.sunoapi.org/*"
],
"optional_permissions": [
  "contextMenus",
  "notifications"
]
```

**Changes:**
- URL patterns move to `host_permissions`
- Add `alarms` permission (for polling)
- `menus` → `contextMenus` (rename)
- Move `notifications` to optional (better UX)

### Change 5: Remove browser_specific_settings

**Remove this entire section** (Firefox-specific, not needed for Chrome):
```json
"browser_specific_settings": { ... }  // DELETE for Chrome
```

### Change 6: Add 128x128 icon requirement

Chrome requires a 128x128 icon (you already have this):
```json
"icons": {
  "16": "icons/glitch_note-48.png",
  "48": "icons/glitch_note-48.png",
  "128": "icons/glitch_note-128.png"
}
```

---

## 2. Background Script Refactoring (MAJOR)

### Issue 1: Loading Dependencies

**Current code (background.js:13-15):**
```javascript
const script = document.createElement('script');
script.src = browser.runtime.getURL('prompts.js');
document.head.appendChild(script);
```

**Problem:** Service workers have no `document` or DOM.

**Solution A - importScripts (non-module):**
```javascript
// At top of background.js
importScripts('logger.js', 'prompts.js');
```

**Solution B - ES6 Modules (if using "type": "module"):**
```javascript
// Convert prompts.js to export its data
import { CUSTOM_STYLE_SYSTEM_PROMPT, LYRICS_USER_PROMPT } from './prompts.js';
```

**Recommendation:** Use `importScripts()` - simpler migration.

### Issue 2: Polling with setInterval (background.js:690)

**Current code:**
```javascript
const pollInterval = setInterval(async () => {
  // Poll Suno status every 5 seconds
  const statusData = await pollSunoStatus(request.sunoTaskId, abortController);
  // ... process status
}, 5000);
```

**Problem:** Service worker can be terminated mid-poll. `setInterval` unreliable.

**Solution - Use chrome.alarms API:**

```javascript
// Create a unique alarm for this request
function startPolling(requestId) {
  const alarmName = `poll_${requestId}`;
  chrome.alarms.create(alarmName, {
    delayInMinutes: 0,
    periodInMinutes: 0.083 // ~5 seconds (minimum is 1 minute, but can use 0.083 for sub-minute)
  });
}

// Listen for alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('poll_')) {
    const requestId = alarm.name.replace('poll_', '');
    await handlePoll(requestId);
  }
});

async function handlePoll(requestId) {
  // Load request from storage (can't rely on global state)
  const { requests } = await chrome.storage.local.get('requests');
  const request = requests.find(r => r.id === requestId);
  
  if (!request) {
    chrome.alarms.clear(`poll_${requestId}`);
    return;
  }
  
  // Poll status
  const statusData = await pollSunoStatus(request.sunoTaskId);
  
  // Update request in storage
  // ...
  
  // Stop polling if complete/failed
  if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
    chrome.alarms.clear(`poll_${requestId}`);
  }
}
```

**Alternative - Use chrome.alarms for periodic check:**

Actually, Chrome allows sub-minute alarms for event-driven tasks. But the cleanest approach is:

```javascript
// Option: Keep using setTimeout for short polls, but make it resilient
async function waitForSunoCompletion(request, abortController) {
  const maxAttempts = 96;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Check if cancelled
    if (abortController.signal.aborted) {
      throw new Error('Cancelled');
    }
    
    const statusData = await pollSunoStatus(request.sunoTaskId, abortController);
    
    if (statusData.status === 'COMPLETED') {
      // Handle completion
      return;
    } else if (statusData.status === 'FAILED') {
      throw new Error('Suno generation failed');
    }
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }
  
  throw new Error('Suno generation timeout (8 minutes)');
}
```

**Recommendation:** Use `while` loop with `setTimeout` promise for simplicity. Service worker will stay alive during active async operations.

### Issue 3: State Persistence

**Current code (background.js:18-73):**
```javascript
let ANTHROPIC_API_KEY = '';
let SUNO_API_KEY = '';
let allRequests = [];
let activeRequests = new Map();
let settings = { ... };
```

**Problem:** Service worker can terminate. Global variables will be reset.

**Solution:** Reload state at start of each message handler:

```javascript
// Add helper to ensure state is loaded
async function ensureStateLoaded() {
  if (!allRequests || allRequests.length === 0) {
    await loadRequests();
  }
  if (!ANTHROPIC_API_KEY) {
    await loadAPIKeys();
  }
}

// Use in message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ensureStateLoaded(); // Always reload state
    
    if (message.action === 'getRequests') {
      sendResponse({ requests: allRequests, settings });
    }
    // ... rest of handlers
  })();
  return true;
});
```

**Better:** Convert to always loading from storage on demand (slower but safer).

### Issue 4: API Namespace

**Current:** Uses `browser.*` API (Firefox-style)  
**Chrome:** Prefers `chrome.*` but also supports `browser.*`

**Options:**
1. Keep `browser.*` - Chrome supports it via polyfill
2. Change all to `chrome.*`
3. Use both with fallback: `const api = chrome || browser;`

**Recommendation:** Keep `browser.*` if you want to maintain one codebase. Or use:

```javascript
const browser = chrome || browser;
```

---

## 3. Logger.js Changes

**Issue:** Uses `setInterval` for auto-save (logger.js)

**Current:**
```javascript
setInterval(() => {
  saveLogs();
}, 60000); // Every minute
```

**Solution:** Use `chrome.alarms`:

```javascript
// On extension install/startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('autoSaveLogs', {
    periodInMinutes: 1
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoSaveLogs') {
    saveLogs();
  }
});
```

---

## 4. Popup.js Changes

**Good news:** Popup scripts are NOT service workers!

The popup runs in a normal browser context with DOM access.

**Changes needed:**
- Change `browser.*` to `chrome.*` (optional)
- `setInterval` in popup.js is FINE (lines 757, 764)

**No major refactoring needed for popup.js!**

---

## 5. Content Script Changes

**Good news:** Content scripts run in page context, not service workers!

**Changes needed:**
- Change `browser.*` to `chrome.*` (optional)
- That's it!

**No major refactoring needed for content_script.js!**

---

## 6. Migration Strategy

### Phase 1: Create Chrome-specific files

Create `/add-on-chrome/` directory with V3 versions:

```bash
cp -r add-on add-on-chrome
cd add-on-chrome
```

This way you maintain Firefox V2 version separately.

### Phase 2: Update manifest.json

Apply all changes from Section 1 above.

### Phase 3: Refactor background.js

1. Replace `document.createElement('script')` with `importScripts()`
2. Add state reload to message handlers
3. Refactor polling from `setInterval` to `while` loop with `setTimeout`
4. Test thoroughly

### Phase 4: Update logger.js

Convert auto-save `setInterval` to `chrome.alarms`.

### Phase 5: Test

Test ALL functionality:
- ✅ Song generation
- ✅ Polling/status updates
- ✅ Cancellation
- ✅ Download
- ✅ Retry
- ✅ Multiple concurrent requests
- ✅ Extension restart mid-generation (service worker termination)

---

## 7. Testing Service Worker Termination

**Critical:** You MUST test that your extension works when the service worker is terminated mid-operation.

**How to test:**
1. Generate a song (starts polling)
2. Open Chrome DevTools → Sources → Service Workers
3. Click "Stop" to terminate the worker
4. Wait a few seconds
5. Open popup - should resume polling/show correct status

**What should happen:**
- State is persisted to storage
- When user interacts next, service worker restarts
- It loads state from storage
- Polling resumes

---

## 8. Key Files to Modify

### High Priority:
1. ✅ **manifest.json** - All V3 changes
2. 🔥 **background.js** - Service worker conversion (HARDEST)
3. ✅ **logger.js** - Replace setInterval with alarms

### Low Priority:
4. ✅ **popup.js** - Optional: change `browser.*` to `chrome.*`
5. ✅ **content_script.js** - Optional: change `browser.*` to `chrome.*`

### No Changes Needed:
- ✅ **Readability.js** - No changes
- ✅ **prompts.js** - Just needs to be loaded via `importScripts()`
- ✅ **options.js** - Optional API namespace changes

---

## 9. Breaking Changes Summary

| V2 Feature | V3 Change | Difficulty |
|------------|-----------|------------|
| `manifest_version: 2` | `manifest_version: 3` | Easy |
| `background.scripts` | `background.service_worker` | Medium |
| `browser_action` | `action` | Easy |
| URL permissions in `permissions` | Move to `host_permissions` | Easy |
| `document.createElement('script')` | `importScripts()` | Easy |
| `setInterval` for polling | `chrome.alarms` or async loop | Hard |
| Global state variables | Reload from storage | Medium |
| `browser.*` namespace | `chrome.*` (optional) | Easy |

---

## 10. Recommended Approach

### Option A: Keep Firefox V2 + Create Chrome V3 (RECOMMENDED)

**Pros:**
- Maintain separate codebases
- Firefox stays on stable V2
- Chrome gets V3 without breaking Firefox

**Cons:**
- Two codebases to maintain

**Structure:**
```
/add-on/          # Firefox (Manifest V2)
/add-on-chrome/   # Chrome (Manifest V3)
/shared/          # Shared code (Readability.js, prompts.js)
```

### Option B: Migrate everything to V3

**Pros:**
- One codebase
- Firefox supports V3 too (since Firefox 109)

**Cons:**
- More work upfront
- Need to test both browsers

---

## 11. Timeline Estimate

| Task | Time | Difficulty |
|------|------|------------|
| Update manifest.json | 30 min | Easy |
| Refactor background.js script loading | 30 min | Easy |
| Refactor background.js polling | 2 hours | Hard |
| Test service worker termination | 1 hour | Medium |
| Update logger.js | 30 min | Easy |
| Update popup/content (optional) | 30 min | Easy |
| End-to-end testing | 1 hour | Medium |
| **Total** | **5-6 hours** | **Medium-High** |

---

## 12. Next Steps

1. **Decide:** Separate codebases (V2 + V3) or migrate everything?
2. **Create:** Chrome directory structure
3. **Modify:** manifest.json first (quick wins)
4. **Refactor:** background.js polling (hardest part)
5. **Test:** Service worker resilience
6. **Submit:** Chrome Web Store

---

## Resources

- [Chrome Manifest V3 Migration Checklist](https://developer.chrome.com/docs/extensions/mv3/mv3-migration-checklist/)
- [Background Scripts → Service Workers](https://developer.chrome.com/docs/extensions/mv3/migrating_to_service_workers/)
- [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/alarms/)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

---

## Questions to Consider

1. Do you want to maintain separate V2 (Firefox) and V3 (Chrome) versions?
2. Or migrate everything to V3 (works on both)?
3. How critical is it that the extension works perfectly when the service worker is terminated mid-generation?

Let me know your preference and we'll start the migration! 🚀


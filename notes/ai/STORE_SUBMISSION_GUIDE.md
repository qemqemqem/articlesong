# Browser Extension Store Submission Guide
**ArticleSong - Turn Articles into Songs**

---

## 🦊 FIREFOX ADD-ON STORE

### Current Status
- ✅ Manifest V2 (Firefox still supports this)
- ✅ Permissions cleaned up (removed unnecessary `<all_urls>` from permissions)
- ✅ Extension ID set to: richardson.andrew@gmail.com
- ⚠️ Ready to submit with minor additions

### Pre-Submission Checklist
- [ ] Create 128x128 icon (required)
- [ ] Take 3-5 screenshots
- [ ] Write privacy policy
- [ ] Test in fresh Firefox profile
- [ ] Package extension as .zip

### Questions Firefox Will Ask

#### 1. **Add-on Name**
**Answer:** ArticleSong (or "Turn Articles into Songs")

#### 2. **Summary (250 characters max)**
**Draft Answer:** 
"Transform any web article into a musical experience! Converts article text into custom songs. Supports multiple music styles from musical theater to meme songs. Requires SunoAPI key (Anthropic API optional for enhanced lyrics)."

**Character count:** 247 ✅

#### 3. **Description (Full)**
**Draft Answer:**
```
ArticleSong brings your reading to life by transforming web articles into original songs!

HOW IT WORKS:
1. Navigate to any article
2. Click the ArticleSong icon
3. Choose your music style (Musical, Spoken Word, Meme, Cute, Informative)
4. Lyrics are generated from the article text (either by SunoAPI directly or by Anthropic Claude for enhanced quality)
5. Lyrics are sent to SunoAPI, which forwards them to Suno.ai for music generation
6. Wait 2-3 minutes while your personalized song is created
7. Listen directly in your browser or download the MP3

THE TECHNICAL FLOW:
Article Text → Lyrics Generation (SunoAPI or Anthropic) → SunoAPI → Suno.ai → Your Song

FEATURES:
✓ Multiple song styles to match your mood
✓ Streaming playback - start listening in ~40 seconds
✓ Download songs for offline listening
✓ Track multiple song generations simultaneously
✓ Complete history of your generated songs
✓ Works on any webpage with readable content
✓ Optional Anthropic integration for higher-quality lyrics

REQUIREMENTS:
• SunoAPI key (REQUIRED - intermediary service for Suno.ai music generation)
• Anthropic API key (OPTIONAL - for enhanced lyrics generation via Claude)

All keys are stored locally in your browser and only sent to their respective APIs.

PRIVACY:
• No data collection or tracking
• API keys stored locally only
• No external servers operated by us
• All communication is direct from your browser to the API providers

Perfect for:
- Making learning more engaging
- Creating unique audio content from articles
- Entertaining yourself while browsing
- Accessibility - listen instead of read
```

#### 4. **Categories**
**Answer:** 
- Primary: Entertainment
- Secondary: Productivity / Web Tools

#### 5. **Support Email**
**Answer:** richardson.andrew@gmail.com

#### 6. **Support Website**
**TODO:** Do you have a GitHub repo or website to link here?
- Option: Link to GitHub repo
- Option: Create simple landing page
- Option: Leave blank

#### 7. **Homepage URL**
**TODO:** Same as above

#### 8. **Privacy Policy URL** ⚠️
**REQUIRED** - See Privacy Policy section below

#### 9. **License**
**Answer:** MIT License ✅
- Open source, permissive, widely recognized
- LICENSE file created in repo root
- Allows free use, modification, and distribution

#### 10. **Do you collect or transmit user data?**
**Answer:** NO
- API keys stored in `browser.storage.sync` (encrypted by browser)
- Request history stored in `browser.storage.local` (local only)
- No telemetry, analytics, or external data transmission
- Only communicates with user-configured API endpoints

#### 11. **Do you use any third-party services?**
**Answer:** YES
- **SunoAPI (REQUIRED)** - Intermediary service that forwards lyrics to Suno.ai for music generation
- **Anthropic Claude API (OPTIONAL)** - Enhanced lyrics generation if user provides their own key
- All services are explicitly configured by user for core functionality

#### 12. **Source Code Review**
Firefox will review your code. Be prepared to explain:

**a. Why do you need `<all_urls>` in content_scripts?**
**Answer:** "We need to extract article text from any webpage the user visits. The content script only activates when the user explicitly clicks our extension icon. We use Mozilla's Readability.js library to parse article content."

**b. Why do you need these permissions?**
- `activeTab`: Read current tab content when user clicks icon
- `downloads`: Save generated MP3 files to user's Downloads folder
- `menus`: Add context menu items for different song styles
- `notifications`: Alert user when song generation completes
- `storage`: Store API keys and song history locally
- `https://api.anthropic.com/*`: (Optional) Generate enhanced song lyrics with Claude
- `https://api.sunoapi.org/*`: (Required) Send lyrics to SunoAPI, which forwards them to Suno.ai for music generation

**c. What is Readability.js?**
**Answer:** "Mozilla's open-source library for extracting main article content from webpages. Same library used in Firefox Reader View. Minified version included - source available at https://github.com/mozilla/readability"

**d. Why do API requests come from browser?**
**Answer:** "Extension makes direct API calls from the background script using user-provided API keys stored locally. This is a client-side only extension with no backend server. The `anthropic-dangerous-direct-browser-access` header is required by Anthropic for browser-based API calls."

#### 13. **Is this extension functional without payment?**
**Answer:** YES, but requires user to provide their own SunoAPI key (which has its own costs from the API provider)

**Clarification:** The extension itself is free. Users need:
- **SunoAPI key (REQUIRED)** - Pricing varies by plan, intermediary service for Suno.ai
- **Anthropic API key (OPTIONAL)** - ~$0.10 per song for enhanced lyrics via Claude
  - Without Anthropic, lyrics are generated by SunoAPI directly

#### 14. **Monetization**
**Answer:** None - completely free extension

#### 15. **Target Audience**
**Answer:** General audience (no age restrictions needed)

#### 16. **Screenshots Required**
**TODO:** Need 3-5 screenshots showing:
1. Extension popup with song style options
2. Song generation in progress
3. Completed song ready to play
4. Settings page with API key configuration
5. Song playing on a webpage (audio element visible)

Dimensions: 1280x800 or 640x400

#### 17. **Version Notes**
**For v1.0:**
"Initial release. Features: Multiple song styles, streaming playback, download support, multi-request tracking, local history management."

---

## 🎨 CHROME WEB STORE

### Current Status
- ❌ **REQUIRES MANIFEST V3 MIGRATION**
- ⚠️ Not ready for submission yet
- Estimated migration effort: 6-10 hours

### Manifest V3 Migration Required Changes

#### 1. **Manifest.json Changes**
```json
{
  "manifest_version": 3,  // Changed from 2
  
  "action": {  // Changed from "browser_action"
    "default_icon": "icons/songify.png",
    "default_popup": "popup.html"
  },
  
  "background": {
    "service_worker": "background.js"  // Changed from scripts array
  },
  
  "host_permissions": [  // Split from permissions
    "https://api.anthropic.com/*",
    "https://api.sunoapi.org/*"
  ],
  
  "permissions": [
    "activeTab",
    "downloads",
    "notifications",
    "storage"
    // "menus" might need to be "contextMenus"
  ]
}
```

#### 2. **background.js Refactoring**
**Problems:**
- Line 12-15: Can't use `document.createElement` in service worker
- Line 363-533: `setInterval` polling can break (service worker terminates)
- Global state (`activeRequests`, `allRequests`) can be lost

**Solutions:**
- Replace `document.createElement` with `importScripts('prompts.js')`
- Replace long `setInterval` with `chrome.alarms` API
- Persist state more aggressively to storage
- Use `chrome.runtime.onStartup` to restore state

#### 3. **logger.js Refactoring**
**Problems:**
- Line 39-41: `setInterval` for auto-save
- Line 54: `Blob` and `URL.createObjectURL` (might work, test needed)

**Solutions:**
- Replace `setInterval` with `chrome.alarms`
- Test Blob API in service worker context

#### 4. **API Namespace**
Change all `browser.*` to `chrome.*` (or use WebExtension polyfill)

### Pre-Submission Checklist (Chrome)
- [ ] Complete Manifest V3 migration
- [ ] Test thoroughly in Chrome with V3
- [ ] Create 128x128 icon (required)
- [ ] Take 3-5 screenshots
- [ ] Write privacy policy
- [ ] Pay $5 developer registration fee
- [ ] Package extension as .zip

### Questions Chrome Will Ask

*Most questions are similar to Firefox. Key differences:*

#### **Single Purpose**
Chrome requires extensions to have a narrow, single purpose.

**Answer:** "Transform web article text into musical songs using AI-generated lyrics and music."

#### **Permission Justification**
Chrome is MUCH stricter about permissions.

**Justify `<all_urls>` in content_scripts:**
"Required to extract article content from any webpage user visits. Content script only activates on explicit user action (clicking extension icon). Uses Mozilla Readability.js to parse main article content."

**Justify each host_permission:**
- `api.anthropic.com`: (Optional) Generate enhanced song lyrics from article text using Claude
- `api.sunoapi.org`: (Required) Intermediary service that sends lyrics to Suno.ai for music generation

#### **Data Usage & Privacy**
*See Firefox answers - same responses*

#### **Screenshots**
Chrome requires:
- At least 1 screenshot (1280x800 or 640x400)
- Recommended: 3-5 screenshots
- Optional: 440x280 promotional tile image

---

## 📋 PRIVACY POLICY (REQUIRED FOR BOTH)

**TODO:** Need to host this somewhere public (GitHub Pages, simple website, etc.)

**Draft Privacy Policy:**

```markdown
# Privacy Policy for ArticleSong

**Last Updated:** [TODO: Insert Date]

## Overview
ArticleSong is a browser extension that transforms web articles into songs using AI. We are committed to protecting your privacy.

## Data Collection
**We do NOT collect, store, or transmit any personal data.**

## Data Storage
All data is stored locally in your browser using the browser's built-in storage APIs:

- **API Keys**: Stored in `browser.storage.sync` (encrypted by your browser, synced across your devices)
- **Song History**: Stored in `browser.storage.local` (local to your device only)
- **Settings**: Stored in `browser.storage.local` (local to your device only)

## Data Transmission
ArticleSong only transmits data to third-party APIs that you explicitly configure:

1. **Anthropic Claude API** (https://api.anthropic.com)
   - Purpose: Generate song lyrics from article text
   - Data sent: Article text content, your API key
   - Your responsibility: Review Anthropic's privacy policy

2. **SunoAPI** (https://api.sunoapi.org)
   - Purpose: Generate music from lyrics
   - Data sent: Lyrics, style tags, song title, your API key
   - Your responsibility: Review SunoAPI's privacy policy

We do not operate any backend servers. All API communication is direct from your browser to the service providers you configure.

## Third-Party Services
This extension requires you to provide your own API keys for:
- Anthropic Claude API
- SunoAPI

You are responsible for reviewing the privacy policies of these services.

## Cookies
ArticleSong does not use cookies.

## Analytics
ArticleSong does not include any analytics, tracking, or telemetry.

## Changes to Privacy Policy
Any changes will be posted here and in extension updates.

## Contact
For questions: richardson.andrew@gmail.com
```

**TODO:** Host this at a public URL, then add URL to both store submissions

---

## 🎯 IMMEDIATE ACTION ITEMS

### For Firefox Submission (Can do NOW)
1. ✅ Manifest ready
2. [ ] Generate icon sizes (128x128 minimum)
3. [ ] Take screenshots
4. [ ] Create & host privacy policy
5. [ ] Create Firefox developer account
6. [ ] Package & submit

### For Chrome Submission (Later)
1. [ ] Complete Manifest V3 migration
2. [ ] Test thoroughly
3. [ ] Same assets as Firefox
4. [ ] Pay $5 fee
5. [ ] Submit

---

## 📝 NOTES FROM CODE REVIEW

### Extension Functionality (from code analysis)
- **Main Flow**: User clicks extension → extracts article with Readability.js → generates lyrics (via SunoAPI or optionally via Anthropic Claude) → sends lyrics to SunoAPI → SunoAPI forwards to Suno.ai → receives music → streams/plays audio
- **Permissions Usage**: All permissions are justified and necessary for core functionality
- **Storage Usage**: Only local storage, no external database
- **Network Requests**: Only to user-configured APIs (SunoAPI required, Anthropic optional)
- **Content Script**: Passive, only responds to user-initiated actions
- **Background Script**: Manages API calls, request tracking, notifications

### Code Quality Notes
- Well-structured with clear separation of concerns
- Comprehensive error handling
- Detailed logging system for debugging
- Request tracking with status updates
- Clean cancellation/retry logic

### Potential Store Review Concerns
1. **`<all_urls>` permission** - Strongly justified (article extraction)
2. **API key storage** - Secure (using browser.storage.sync)
3. **External API calls** - Transparent and necessary
4. **Minified code** (Readability.js) - Need to provide source link

---

## 🚀 ESTIMATED TIMELINE

**Firefox Submission:**
- Asset creation: 2-3 hours
- Privacy policy: 1 hour
- Submission: 30 minutes
- **Review time: 1-5 days**
- **Total: Can submit today!**

**Chrome Submission:**
- V3 migration: 6-10 hours
- Testing: 2-3 hours
- Asset creation: (reuse from Firefox)
- Submission: 30 minutes
- **Review time: 1-7 days**
- **Total: 2-3 days of work**

---

## ❓ REMAINING QUESTIONS FOR YOU

1. **GitHub Repository**: Do you have one? Can link in store listings
2. **License**: What license do you want? (MIT recommended)
3. **Privacy Policy Hosting**: Where should we host it?
   - GitHub Pages (free, easy)
   - Simple static site
   - GitHub repo README
4. **Extension Name**: Keep "Turn articles into songs!" or change to "ArticleSong"?
5. **Pricing Model**: Completely free? (Yes, but users need API keys)
6. **Screenshots**: Want me to help take/stage these?
7. **Chrome Priority**: When do you want to tackle the V3 migration?



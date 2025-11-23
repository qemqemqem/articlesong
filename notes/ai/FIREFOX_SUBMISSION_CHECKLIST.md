# Firefox Add-on Store Submission Checklist

**Goal:** Get ArticleSong published on Firefox Add-on Store  
**Time Required:** 2-4 hours of work + 1-5 days review time

---

## ✅ COMPLETED

- [x] Manifest V2 ready
- [x] Extension ID set (richardson.andrew@gmail.com)
- [x] Permissions cleaned up (removed unnecessary `<all_urls>`)
- [x] Privacy policy written (`notes/PRIVACY_POLICY.md`)
- [x] Icon sizes generated (48px, 96px, 128px)
- [x] Packaging script created (`package-firefox.sh`)

---

## 📋 TODO - BEFORE SUBMISSION

### 1. Host Privacy Policy Publicly ⚠️ REQUIRED

Firefox requires a public URL for your privacy policy.

**Option A: GitHub Pages (Recommended - Free & Easy)**
```bash
# If you don't have a GitHub repo yet:
cd /home/keenan/Dev/articlesong
git remote add origin https://github.com/YOUR_USERNAME/articlesong.git
git push -u origin main

# Enable GitHub Pages:
# 1. Go to your repo → Settings → Pages
# 2. Source: Deploy from branch → main → /root
# 3. Wait 2 minutes
# 4. Your privacy policy will be at:
#    https://YOUR_USERNAME.github.io/articlesong/notes/PRIVACY_POLICY.html
```

**Note:** You'll need to convert PRIVACY_POLICY.md to HTML or GitHub will render it automatically.

**Option B: Quick HTML Version**
Create `notes/PRIVACY_POLICY.html` and host anywhere (Netlify, Vercel, etc.)

**Option C: GitHub Raw Link**
Just use the raw markdown URL (less pretty but works):
```
https://raw.githubusercontent.com/YOUR_USERNAME/articlesong/main/notes/PRIVACY_POLICY.md
```

**TODO:** 
- [ ] Choose hosting method
- [ ] Get public URL for privacy policy
- [ ] Test URL in browser

---

### 2. Take Screenshots 📸 REQUIRED

Firefox requires **1-10 screenshots** (recommended: 3-5)

**Requirements:**
- Format: PNG or JPG
- Dimensions: 1280x800 or 640x400
- Show actual functionality

**Recommended Screenshots:**

**Screenshot 1: Extension Popup - Song Styles**
- Show the popup with different song style options
- Capture when hovering over the extension icon
```bash
# To take screenshot:
# 1. Open Firefox
# 2. Load any article
# 3. Click ArticleSong icon
# 4. Take screenshot (Shift+F2 → screenshot --fullpage)
```

**Screenshot 2: Song Generation in Progress**
- Show status: "Generating lyrics..." or "Creating music..."
- Display progress indicator

**Screenshot 3: Song Ready to Play**
- Show completed song with audio player
- Include article title and song metadata

**Screenshot 4: Settings/Options Page**
- Show API key configuration
- Settings options visible

**Screenshot 5: Song Playing on Page**
- Show the injected audio element at top of article
- Demonstrate the actual use case

**TODO:**
- [ ] Take 3-5 screenshots
- [ ] Resize to 1280x800 or 640x400
- [ ] Save as PNG
- [ ] Name them descriptively (e.g., `screenshot-popup.png`)

---

### 3. Test in Clean Firefox Profile 🧪 RECOMMENDED

Before submitting, test that everything works:

```bash
# Create a test profile
firefox -P

# Create new profile: "ArticleSong-Test"
# Install your extension from add-on/ folder
# Test all features:
# - Generate song (all styles)
# - Check audio playback
# - Test download
# - Verify settings work
# - Check notifications
```

**TODO:**
- [ ] Create clean Firefox profile
- [ ] Load extension in test profile
- [ ] Test all song styles work
- [ ] Verify audio plays correctly
- [ ] Test download functionality
- [ ] Check settings persist

---

### 4. Write Store Listing Content 📝 REQUIRED

**Extension Name:**
- Current: "Turn articles into songs!"
- Alternative: "ArticleSong"
- **TODO:** Decide on final name → _________________

**Summary (250 chars max):**
Already drafted in `STORE_SUBMISSION_GUIDE.md`:
> "Transform any web article into a musical experience! Converts article text into custom songs. Supports multiple music styles from musical theater to meme songs. Requires SunoAPI key (Anthropic API optional for enhanced lyrics)."

**TODO:**
- [ ] Review summary, make any edits
- [ ] Confirm character count ≤ 250

**Full Description:**
Already drafted in `STORE_SUBMISSION_GUIDE.md` - review and adjust if needed.

**TODO:**
- [ ] Review full description
- [ ] Make any final edits

---

## 🚀 SUBMISSION STEPS

### Step 1: Create Firefox Developer Account

1. Go to: https://addons.mozilla.org/developers/
2. Sign in with Firefox Account (or create one)
3. Accept Developer Agreement
4. Verify email if needed

**Cost:** FREE (no registration fee for Firefox!)

**TODO:**
- [ ] Create/sign in to Firefox Account
- [ ] Accept developer agreement

---

### Step 2: Package Your Extension

Run the packaging script:

```bash
cd /home/keenan/Dev/articlesong
./package-firefox.sh
```

This creates `articlesong-firefox-v1.0.zip` with all necessary files.

**TODO:**
- [ ] Run packaging script
- [ ] Verify .zip file created
- [ ] Check file size (should be ~100KB)

---

### Step 3: Submit to Firefox Add-on Store

1. Go to https://addons.mozilla.org/developers/addon/submit/distribution
2. Choose: **"On this site"** (listed on Firefox Add-ons)
3. Click **"Continue"**

**Upload Your Add-on:**
- Upload: `articlesong-firefox-v1.0.zip`
- Wait for automatic validation
- Fix any errors if they appear

**Source Code (if requested):**
- Firefox may ask for source code if they see minified files
- You have `Readability.js` which is minified
- **Answer:** "We use Mozilla's open-source Readability.js library. Source available at: https://github.com/mozilla/readability"

**TODO:**
- [ ] Upload .zip file
- [ ] Pass automatic validation
- [ ] Note any warnings/errors

---

### Step 4: Fill Out Listing Information

**Basic Information:**
- **Name:** [Your chosen name]
- **Add-on URL:** articlesong (or choose your own slug)
- **Summary:** [Use your drafted summary]
- **Description:** [Use your drafted description]

**Categories:**
- Primary: Entertainment
- Secondary: Productivity (or Web Development)

**Support:**
- **Support Email:** richardson.andrew@gmail.com
- **Support Website:** [Your GitHub repo URL or leave blank]
- **Homepage:** [Your GitHub repo or project page, or leave blank]

**Privacy Policy:**
- **Privacy Policy URL:** [The public URL from Step 1] ⚠️ REQUIRED

**License:**
- **Chosen:** MIT License ✅
- Open source, permissive license
- LICENSE file created in repository root

**Version Notes:**
```
Initial release (v1.0)

Features:
- Multiple song styles (Musical, Spoken Word, Meme, Cute, Informative)
- Streaming audio playback
- Download generated songs as MP3
- Multi-request tracking
- Song history management
- Configurable settings
```

**Tags/Keywords:**
- article
- music
- song
- AI
- text-to-speech
- entertainment
- suno
- lyrics

**TODO:**
- [ ] Fill out all listing information
- [ ] Add privacy policy URL
- [ ] Choose license
- [ ] Add version notes

---

### Step 5: Upload Media Assets

**Icon:**
- Already in your .zip (handled automatically)

**Screenshots:**
- Upload 3-5 screenshots from Step 2
- Add captions for each:
  - "Choose your song style"
  - "Song generation in progress"
  - "Listen or download your song"
  - etc.

**TODO:**
- [ ] Upload all screenshots
- [ ] Add descriptive captions
- [ ] Preview how listing will look

---

### Step 6: Technical Details

Firefox will show you detected permissions. Be ready to explain:

**Why `<all_urls>` in content_scripts?**
> "Needed to extract article text from any webpage using Mozilla's Readability.js library. Content script only activates when user explicitly clicks the extension icon."

**Why these host permissions?**
> "api.anthropic.com: Optional enhanced lyrics generation  
> api.sunoapi.org: Required intermediary service for Suno.ai music generation"

**Do you collect user data?**
> "No. All data stored locally in browser. No telemetry or analytics. Only communicates with user-configured API services."

**TODO:**
- [ ] Review detected permissions
- [ ] Confirm all look correct

---

### Step 7: Submit for Review

1. Review everything one last time
2. Click **"Submit Version"**
3. Wait for Mozilla review (typically 1-5 days)

**During Review:**
- Check your email for any reviewer questions
- Be ready to explain code if they ask
- They may request changes

**TODO:**
- [ ] Final review
- [ ] Submit!
- [ ] Note submission date: __________

---

## 📧 COMMON REVIEWER QUESTIONS

Be prepared to answer these if reviewers reach out:

### Q: "Why do you need <all_urls> permission?"
**A:** "We need to extract article content from any webpage the user visits. The content script only activates when the user explicitly clicks our extension icon to generate a song. We use Mozilla's open-source Readability.js library (same as Firefox Reader View) to parse the main article content."

### Q: "What is Readability.js?"
**A:** "Mozilla's official open-source library for article extraction. Source: https://github.com/mozilla/readability. We include the minified version for performance."

### Q: "How are API keys stored?"
**A:** "API keys are stored in browser.storage.sync, which is encrypted by the browser and synced across the user's devices. We never transmit keys anywhere except to their respective API endpoints (user-configured)."

### Q: "Do you track users?"
**A:** "No. We have no analytics, no telemetry, no external servers. All data stays local. We only make API calls to services the user explicitly configures with their own keys."

### Q: "Why does this require paid API services?"
**A:** "The extension itself is free. Users must provide their own API keys for SunoAPI (required for music generation) and optionally Anthropic (for enhanced lyrics). These are third-party services with their own pricing. We're not affiliated with them."

### Q: "What data goes to third parties?"
**A:** "Only data necessary for song generation: article text → lyrics generation (SunoAPI or Anthropic) → SunoAPI → Suno.ai. Users explicitly trigger this by clicking the extension. We have no control over these third-party services and include clear privacy disclosures."

---

## 🎯 POST-SUBMISSION

After you submit, expect:

**Timeline:**
- Automatic validation: Instant
- Human review: 1-5 days (usually 2-3)
- Listed publicly: Within minutes of approval

**Possible Outcomes:**

✅ **Approved** → Listed immediately, start promoting!

⚠️ **Needs Information** → Reviewer has questions, respond promptly

❌ **Rejected** → Address issues and resubmit

**TODO After Approval:**
- [ ] Update GitHub repo with store link
- [ ] Share with friends/social media
- [ ] Monitor reviews and feedback
- [ ] Plan v1.1 improvements

---

## 🔧 QUICK REFERENCE

**Important Links:**
- Developer Dashboard: https://addons.mozilla.org/developers/
- Submit New Add-on: https://addons.mozilla.org/developers/addon/submit/
- Review Status: https://addons.mozilla.org/developers/addons
- Documentation: https://extensionworkshop.com/

**Files You Need:**
- ✅ `articlesong-firefox-v1.0.zip` (created by `package-firefox.sh`)
- ✅ 3-5 screenshots (1280x800 or 640x400)
- ✅ Privacy policy URL (public)

**Estimated Total Time:**
- Screenshots: 30 min
- Privacy policy hosting: 15 min
- Listing content: 30 min
- Testing: 30 min
- Submission: 15 min
- **Total: ~2 hours**

---

## ❓ NEED HELP?

**If you get stuck:**
1. Check Firefox documentation: https://extensionworkshop.com/
2. Email me at: richardson.andrew@gmail.com (your support email)
3. Firefox support: extensionworkshop@mozilla.com

**Before submitting, ask yourself:**
- [ ] Does it work in a clean Firefox profile?
- [ ] Are all screenshots clear and descriptive?
- [ ] Is privacy policy publicly accessible?
- [ ] Have I tested all features?
- [ ] Is the description clear about SunoAPI requirement?

---

## 🚀 YOU'RE ALMOST THERE!

**What's left:**
1. Host privacy policy (15 min)
2. Take screenshots (30 min)
3. Test in clean profile (30 min)
4. Submit! (15 min)

**Total remaining: ~90 minutes of work**

Then just wait for approval! 🎉

Let's ship this! 💪



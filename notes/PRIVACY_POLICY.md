# Privacy Policy for ArticleSong

**Last Updated:** November 23, 2025  
**Contact:** richardson.andrew@gmail.com

---

## Summary

**ArticleSong transmits article content to third-party services when you generate songs.** We (the extension authors) don't collect your data, but the third-party APIs you configure will process it according to their own policies.

---

## What Gets Sent to Third Parties

**When you click to generate a song, here's what happens:**

1. **Article text is extracted** from the webpage (locally in your browser)
2. **Data is sent to SunoAPI** (sunoapi.org) - REQUIRED for all songs
   - Article text or generated lyrics
   - Your SunoAPI key
   - Music style preferences
   - Song title
3. **Optionally sent to Anthropic** (anthropic.com) - if you configure it
   - Article text
   - Your Anthropic API key
4. **SunoAPI forwards to Suno.ai** for music generation
5. **Generated audio is returned** to your browser

**IMPORTANT:** We (the extension authors) are NOT affiliated with Suno.ai, SunoAPI.org, or Anthropic. These are independent third-party services with their own privacy policies and data handling practices. We have no control over how they process your data.

---

## What Stays Local (Never Transmitted)

The following data stays on your device only:
- **API Keys** - Stored in browser.storage.sync (encrypted by your browser)
- **Song History** - List of generated songs (stored in browser.storage.local)
- **Settings** - Your preferences and configuration

This local data is never sent to us or anyone else except as needed to make API calls (your API keys are sent to their respective services).

---

## What We (Extension Authors) Do NOT Do

We do not:
- Collect any data about you
- Track which websites you visit
- Monitor which articles you convert
- Operate any backend servers
- Receive copies of data you send to third-party APIs
- Use analytics or telemetry
- Sell or share data (we don't have any to sell)

---

## Third-Party Services

### SunoAPI (REQUIRED)
- **What it does:** Intermediary service that sends requests to Suno.ai
- **What you send:** Article text, lyrics, music preferences, API key
- **Your responsibility:** Review their privacy policy at sunoapi.org
- **Our affiliation:** None - we are not associated with this service

### Anthropic Claude (OPTIONAL)
- **What it does:** Generates enhanced lyrics from article text
- **What you send:** Article text, API key
- **Privacy policy:** https://www.anthropic.com/legal/privacy
- **Our affiliation:** None - we are not associated with this service

### Suno.ai (Receives data via SunoAPI)
- **What it does:** Generates music from lyrics
- **What it receives:** Whatever SunoAPI forwards to it
- **Our affiliation:** None - we are not associated with this service

**You are responsible for reviewing and accepting the terms of service and privacy policies of these third-party services.**

---

## Permissions Explained

- **`activeTab`** - Read article content when you click the extension icon
- **`storage`** - Save API keys and settings locally in your browser
- **`downloads`** - Save MP3 files to your Downloads folder
- **`notifications`** - Show alerts when songs are ready
- **`menus`** - Display song style options
- **`https://api.anthropic.com/*`** - Make API calls to Claude (optional)
- **`https://api.sunoapi.org/*`** - Make API calls to SunoAPI (required)
- **`<all_urls>` (content scripts)** - Extract article text from any webpage you visit (only when you click the icon)

---

## Your Control

**You control:**
- Which articles you convert (by clicking the extension icon)
- Which third-party services you use (by providing or not providing API keys)
- Your data retention (remove the extension to delete all local data)
- Downloads (songs are only downloaded if you choose to)

**To delete all data:**
- Remove the extension from Firefox
- Or use browser's "Clear browsing data" feature

---

## Security

- API keys stored in `browser.storage.sync` are encrypted by your browser
- All communication uses HTTPS
- No data transmitted to servers we control (we don't have any)
- Extension code is open source for audit

---

## Compliance

**GDPR (EU):** We don't process personal data. Third-party APIs you configure may process data - review their policies. You control when data is sent by choosing when to generate songs.

**CCPA (California):** We don't sell personal information or collect personal information as defined by CCPA.

**Children:** Extension doesn't knowingly collect data from anyone, including children. Requires user to obtain and configure third-party API keys.

---

## Changes to This Policy

We may update this policy. Changes will be posted here with an updated date. Check back periodically for updates.

---

## Disclaimer

**WE ARE NOT RESPONSIBLE FOR:**
- Third-party service availability, pricing, or policy changes
- How third-party services handle your data
- Costs incurred from using third-party APIs
- Content generated by AI services

**USE AT YOUR OWN RISK.**

---

## Open Source

ArticleSong is open source (MIT License). The code is available for review and audit.

---

## Contact

Questions about this privacy policy? Email: richardson.andrew@gmail.com

---

## Key Takeaway

**This extension facilitates communication between your browser and third-party AI services. When you use it, you're sending article content to those services. We (the extension authors) don't collect your data, but the third-party services will process it according to their own policies. Read their privacy policies and use the extension accordingly.**

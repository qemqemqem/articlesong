# End-to-End Testing with Real Suno API

This directory contains tests that load the actual browser extension and make real API calls to Suno.

## 🎯 Purpose

These tests verify that:
- The extension loads correctly in the browser
- Article content is extracted properly
- The extension communicates with the Python backend
- Suno API integration works end-to-end
- Audio is successfully generated and played

## ⚔️ Prerequisites

Before running these tests, ensure you have:

### 1. Python Backend Running
The extension requires a native messaging host (Python script) to be installed:

```bash
# Make sure the Python script is executable
chmod +x app/article_singer.py

# Copy the native messaging manifest to the correct location
# For Firefox on Linux:
sudo cp app/article_singer.json /usr/lib/mozilla/native-messaging-hosts/

# For Firefox on macOS:
sudo cp app/article_singer.json ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/
```

### 2. API Keys Configured
You need valid API keys configured in the extension:

1. Load the extension in Firefox
2. Go to `about:addons`
3. Find "Turn articles into songs!"
4. Click "Options"
5. Enter your API keys:
   - Anthropic API Key (for Claude)
   - PIAPI Key (for Suno access)

### 3. Dependencies Installed
```bash
# Install Node.js dependencies
npm install

# Install Playwright browsers
npx playwright install firefox chromium
```

## 🏹 Running Tests

### Quick Start - Suno Integration Test
```bash
npm run test:suno
```

This will:
- Launch Firefox with the extension loaded (visible browser)
- Navigate to a test page with article content
- Automatically trigger the extension
- Wait for song generation (up to 4 minutes)
- Verify audio playback
- Use a random description from the fixture (and remove it to avoid rate limiting)

### All E2E Tests
```bash
npm run test:e2e
```

### Firefox Only
```bash
npm run test:e2e:firefox
```

### Chrome Only (requires Manifest V3 update)
```bash
npm run test:e2e:chrome
```

### Debug Mode
```bash
npm run test:e2e:debug
```

This opens Playwright Inspector for step-by-step debugging.

## 📋 Test Flow

1. **Load Extension**: Browser launches with extension installed
2. **Get Random Description**: Pulls from `fixtures/song_descriptions.json`
3. **Create Test Page**: Generates HTML with the description content
4. **Navigate**: Opens the test page in the browser
5. **Trigger Extension**: Simulates clicking the extension button
6. **Wait for Audio**: Monitors for `<audio>` element (indicates success)
7. **Verify**: Checks audio source URL is valid
8. **Cleanup**: Removes used description from fixture file

## 🎲 Rate Limiting Protection

To avoid getting blocked by Suno:
- Each test uses a different random description
- Used descriptions are **deleted** from the fixture file
- When the fixture is empty, tests will fail (intentional safety mechanism)
- To reset: restore `song_descriptions.json` from git

## 🛡️ Troubleshooting

### Extension doesn't load
- Check that manifest.json is valid
- Verify file permissions on add-on directory
- Look for errors in browser console

### Native messaging fails
- Ensure Python backend is installed correctly
- Check native messaging manifest path
- Verify Python script has execute permissions
- Look at Firefox's Browser Console (Ctrl+Shift+J)

### Timeout waiting for audio
- Verify API keys are configured
- Check Suno API is responding (could be down)
- Look at Python script logs
- Increase timeout in playwright.config.js

### No descriptions left
```bash
# Restore the fixture file from git
git checkout tests/fixtures/song_descriptions.json
```

## 🎪 Manual Testing

If automated triggering doesn't work, the test will:
1. Open the browser (visible window)
2. Navigate to the test page
3. Print a message asking you to manually click the extension button
4. Wait for the audio element to appear

This semi-automated approach ensures testing even when full automation has issues.

## 📊 Test Reports

After running tests, check:
- `test-results/` - JSON results and artifacts
- `playwright-report/` - HTML report with screenshots/videos
- Console output - Real-time progress

## 🎯 Next Steps

To make tests fully automated:
1. Implement programmatic extension triggering
2. Add visual regression testing
3. Test different song types (musical, spoken, meme, etc.)
4. Add performance metrics tracking
5. Integrate with CI/CD

---

**Stay the course!** These tests are your shield wall against bugs. 🛡️


# 🎵 Suno Integration Tests

## ⚠️ Critical Information

**Suno does NOT have an official public API.**

All available integration options are either:
- **Third-party paid services** that wrap/proxy Suno's functionality
- **Direct browser-based access** using your session cookies

## Quick Start

### 1. Get Credentials

You'll need credentials for at least one approach. See options below.

### 2. Set Environment Variables

Add to your `.env` file:

```bash
# For PiAPI (if you already have it)
PIAPI_KEY=your_key_here

# For Direct Cookie Access (free but risky)
SUNO_SESSION_COOKIE=your_cookie_here

# For Third-Party Services
SUNOAPI_ORG_KEY=your_key_here
AIMUSIC_API_KEY=your_key_here
```

### 3. Run Tests

```bash
# Test all approaches
pytest tests/integration/test_suno_approaches.py -v -s

# Test specific approach
pytest tests/integration/test_suno_approaches.py::TestPiAPI -v -s

# Or run manually
python -m tests.integration.test_suno_approaches piapi
```

## Available Test Approaches

### 1. SunoAPI.org Service (Third-Party)
- **Test:** `TestSunoAPIOrgService`
- **Key:** `SUNOAPI_ORG_KEY`
- **Get it:** https://api.sunoapi.org/
- **Cost:** Paid

### 2. Direct Cookie-Based (Your Suno Account)
- **Test:** `TestDirectCookieBasedAPI`
- **Key:** `SUNO_SESSION_COOKIE`
- **Get it:** Login to suno.com, grab cookie from DevTools
- **Cost:** Free (but may violate TOS)

### 3. AI Music API (Third-Party)
- **Test:** `TestAIMusicAPI`
- **Key:** `AIMUSIC_API_KEY`
- **Get it:** https://aimusicapi.ai/
- **Cost:** Paid

### 4. PiAPI (Third-Party - Your Existing Integration)
- **Test:** `TestPiAPI`
- **Key:** `PIAPI_KEY`
- **Get it:** https://piapi.ai/suno-api
- **Cost:** Paid

### 5. SunoAPI.org Gateway (Third-Party)
- **Test:** `TestSunoAPIOrgGateway`
- **Key:** `SUNOAPI_ORG_KEY` (same as #1)
- **Cost:** Paid

## Recommended Approach

**For Quick Testing:** If you have a PIAPI key, test that first!

**For Free Access:** Use the cookie-based approach (Approach 2), but be aware this may violate Suno's TOS.

**For Production:** Use PiAPI or SunoAPI.org for stability.

## What Each Test Does

Each test will:
1. ✅ Authenticate with the service
2. ✅ Submit a song generation request
3. ✅ Verify response has valid structure
4. ✅ Print full response for debugging

Tests will **skip** if credentials are not provided (not fail).

## Full Documentation

See `notes/ai/SUNO_INTEGRATION_BATTLE_PLAN.md` for complete details on each approach!



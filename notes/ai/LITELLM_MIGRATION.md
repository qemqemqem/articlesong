# Migration to LiteLLM and Claude Sonnet 4.5

## Overview
Successfully migrated the Article Song project from using OpenAI's API directly to using **litellm** with **Claude Sonnet 4.5** (model: `anthropic/claude-sonnet-4-5-20250929`).

## Changes Made

### 1. Dependencies
**File: `requirements.txt`**
- Added `litellm>=1.0.0`
- Added `python-dotenv>=1.0.0`
- Added `requests>=2.31.0`

### 2. Core LLM Module
**File: `app/llms/gpt.py`**
- Replaced `openai.OpenAI` client with `litellm.completion()`
- Updated default model from `gpt-4o` to `anthropic/claude-sonnet-4-5-20250929`
- Removed OpenAI-specific client initialization
- Simplified error handling (removed try/catch from `prompt_completion_json`)

### 3. Main Application
**File: `app/article_singer.py`**
- Changed environment variable from `OPENAI_API_KEY` to `ANTHROPIC_API_KEY`
- Updated message parsing to expect `anthropic_api_key` instead of `openai_api_key`

### 4. Browser Extension

**Files Modified:**
- `add-on/options.html` - Updated label to "Anthropic API Key"
- `add-on/options.js` - Changed all references from `openai_api_key` to `anthropic_api_key`
- `add-on/background.js` - Updated:
  - Variable name from `OPENAI_API_KEY` to `ANTHROPIC_API_KEY`
  - Storage key from `openai_api_key` to `anthropic_api_key`
  - Payload field from `openai_api_key` to `anthropic_api_key`

### 5. Test Files

**Files Updated:**
- `tests/unit/test_gpt_integration.py` - Updated all mocks to use `litellm.completion`
- `tests/unit/test_article_singer.py` - Changed API key references
- `tests/integration/test_native_messaging.py` - Updated all test messages
- `tests/performance/load_test.py` - Updated all payload definitions

### 6. Documentation
**File: `README.md`**
- Added LLM Configuration section documenting Claude Sonnet 4.5
- Updated API Keys section
- Added setup instructions for Anthropic API key

## Model Information

**LiteLLM Model String:** `anthropic/claude-sonnet-4-5-20250929`

This is the Claude Sonnet 4.5 model released on September 29, 2025. LiteLLM automatically routes requests to Anthropic's API using the `anthropic/` prefix.

## Environment Variables

**Old:**
```bash
OPENAI_API_KEY=your_openai_key_here
```

**New:**
```bash
ANTHROPIC_API_KEY=your_anthropic_key_here
```

## Migration Notes

- The `litellm` library provides a unified interface for calling multiple LLM providers
- Claude Sonnet 4.5 should provide comparable or better performance than GPT-4o for lyric generation
- All existing functionality remains intact
- Test coverage has been maintained with updated mocks

## Next Steps

1. Install new dependencies: `pip install -r requirements.txt`
2. Get Anthropic API key from https://console.anthropic.com/
3. Update browser extension options with new Anthropic API key
4. Test the complete flow with a real article

## References

- LiteLLM Documentation: https://docs.litellm.ai/
- Anthropic API Docs: https://docs.anthropic.com/
- Claude Sonnet 4.5 Model: `anthropic/claude-sonnet-4-5-20250929`





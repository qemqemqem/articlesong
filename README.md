# Article Song

A project to create a browser plugin that will take the text of your current page and send it to an AI music generation service, to create a song based on the text of the article.

## LLM Configuration

This project uses **litellm** to call Claude Sonnet 4.5 (`anthropic/claude-sonnet-4-5-20250929`) for generating song lyrics and style tags.

## Setup

### Requirements
Install Python dependencies:
```bash
pip install -r requirements.txt
```

### API Keys
You'll need:
- **Anthropic API Key**: For Claude Sonnet 4.5 (get from https://console.anthropic.com/)
- **PIAPI Key**: For Suno music generation

Configure your API keys in the browser extension options page.

### Installation Steps
1. Copy the native messaging host manifest:
   ```bash
   sudo cp app/article_singer.json /usr/lib/mozilla/native-messaging-hosts/
   ```
2. Load the extension:
   - Go to `about:debugging#/runtime/this-firefox`
   - Add the `manifest.json` file as a Temporary Extension
3. Visit any website and click the extension button to generate a song!

## Music Generation

Uses https://suno.gcui.art/ to access Suno's music generation API.

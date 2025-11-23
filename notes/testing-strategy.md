# Article Song Testing Strategy

## Project Overview

Article Song is a browser extension that converts web page content into songs using AI music generation. The project consists of:

- **Browser Extension (Firefox)**: Extracts text from web pages using Readability.js
- **Python Backend**: Processes text, generates lyrics using GPT, and creates songs via Suno API
- **Native Messaging**: Enables communication between browser extension and Python script

### Architecture Flow

1. User clicks extension button on a web page
2. Extension extracts readable text using Readability.js
3. Text is sent to Python backend via native messaging
4. Python script uses OpenAI GPT to generate song lyrics and style
5. Lyrics are sent to Suno API (via PiAPI) to generate audio
6. Generated song URL is returned to browser and played

### Key Components

- **Browser Extension Files**:
  - `manifest.json`: Extension configuration
  - `background.js`: Main extension logic and native messaging
  - `content_script.js`: DOM manipulation and audio playback
  - `options.js/html`: API key configuration
  - `Readability.js`: Text extraction library

- **Python Backend**:
  - `article_singer.py`: Main native messaging handler
  - `llms/gpt.py`: OpenAI GPT integration
  - `sunoapi/piapi_to_suno.py`: Suno API wrapper via PiAPI
  - `article_singer.json`: Native messaging configuration

## Testing Strategy

### 1. Unit Testing

**Purpose**: Test individual functions and modules in isolation.

#### Python Backend Tests

**Tools**: pytest, unittest.mock

**Test Coverage**:
- Lyric generation functions
- Style tag generation
- API response parsing
- Native messaging protocol handling
- Error handling for API failures

**Example Test Structure**:
```python
# tests/test_article_singer.py
import pytest
from unittest.mock import patch, MagicMock
from app.article_singer import create_audio_data, process_text

def test_create_audio_data_with_mocked_apis():
    with patch('app.llms.gpt.prompt_completion_chat') as mock_gpt, \
         patch('app.sunoapi.piapi_to_suno.generate_audio') as mock_suno:
        
        mock_gpt.return_value = "Test lyrics"
        mock_suno.return_value = "http://test-song-url.com"
        
        result = create_audio_data("Test article text", "musical")
        
        assert result[0] == "http://test-song-url.com"
        assert "Test lyrics" in result[2]

def test_process_text_error_handling():
    with patch('app.article_singer.create_audio_data') as mock_create:
        mock_create.return_value = (None, None, None)
        
        result = process_text("Test text", "musical")
        
        assert "error" in result
        assert result["message"] == "Failed to create audio data"
```

#### JavaScript Tests

**Tools**: Jest, Mocha, Sinon

**Test Coverage**:
- Text extraction from DOM
- Audio playback functionality
- Message passing between scripts
- API key storage and retrieval
- Context menu interactions

**Example Test Structure**:
```javascript
// tests/content_script.test.js
describe('Content Script', () => {
  test('getText extracts readable content', () => {
    // Mock DOM with article content
    document.body.innerHTML = '<article><h1>Title</h1><p>Content</p></article>';
    
    const text = getText();
    
    expect(text).toContain('Title');
    expect(text).toContain('Content');
  });

  test('playAudio creates audio element', () => {
    const testUrl = 'http://test-audio.com/song.mp3';
    
    playAudio(testUrl);
    
    const audioElement = document.querySelector('audio');
    expect(audioElement).toBeTruthy();
    expect(audioElement.src).toBe(testUrl);
  });
});
```

### 2. Integration Testing

**Purpose**: Test component interactions and data flow.

#### Native Messaging Tests

**Tools**: pytest with subprocess, WebExtensions testing framework

**Test Coverage**:
- Browser extension to Python communication
- JSON message formatting and parsing
- API key passing and environment setup
- Error propagation between components

**Example Test Structure**:
```python
# tests/test_integration.py
def test_native_messaging_flow():
    # Start the native messaging script
    process = subprocess.Popen(
        ['python', 'app/article_singer.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Send test message
    test_message = {
        "action": "process_text",
        "text": "Test article content",
        "songType": "musical",
        "openai_api_key": "test_key",
        "piapi_key": "test_key"
    }
    
    # Test the full flow
    response = send_native_message(process, test_message)
    
    assert "audio_url" in response or "error" in response
```

#### API Integration Tests

**Test Coverage**:
- OpenAI GPT API integration
- PiAPI/Suno API integration
- Rate limiting and retry logic
- API key validation

### 3. End-to-End Testing

**Purpose**: Test complete user workflows.

**Tools**: Selenium WebDriver, Puppeteer, or Playwright

**Test Scenarios**:

#### Happy Path Tests
```javascript
// tests/e2e/happy-path.test.js
describe('Complete Song Generation Flow', () => {
  test('generates song from Wikipedia article', async () => {
    // Setup browser with extension loaded
    await page.goto('https://en.wikipedia.org/wiki/Music');
    
    // Click extension button
    await page.click('#article-singer-extension');
    
    // Wait for song generation
    await page.waitForSelector('audio', { timeout: 120000 });
    
    // Verify audio element exists and has source
    const audioSrc = await page.getAttribute('audio', 'src');
    expect(audioSrc).toMatch(/^https?:\/\/.+\.(mp3|wav|ogg)$/);
  });
});
```

#### Error Handling Tests
- Missing API keys
- Invalid web page content
- Network failures
- API rate limiting

#### Different Song Types
- Musical songs
- Spoken word
- Meme songs
- Informative songs
- Cute songs
- Straight lyrics (using original text)

### 4. Performance Testing

**Purpose**: Ensure acceptable response times and resource usage.

**Tools**: Locust, k6, or Artillery

**Test Coverage**:
- Song generation time under different text lengths
- Memory usage during processing
- Concurrent request handling
- API response time monitoring

**Example Performance Test**:
```python
# tests/performance/load_test.py
from locust import HttpUser, task, between

class ArticleSongUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def generate_song(self):
        # Simulate the full flow
        test_payload = {
            "action": "process_text",
            "text": "Sample article content" * 100,
            "songType": "musical"
        }
        
        # Measure end-to-end time
        with self.client.post("/generate", json=test_payload, catch_response=True) as response:
            if response.elapsed.total_seconds() > 60:
                response.failure("Request took too long")
```

### 5. Security Testing

**Purpose**: Identify vulnerabilities and ensure secure operation.

**Tools**: OWASP ZAP, Burp Suite, custom security scripts

**Test Coverage**:

#### API Key Security
- Secure storage in browser extension
- Proper transmission to backend
- No logging of sensitive data
- Key validation and sanitization

#### Input Validation
- XSS prevention in text extraction
- SQL injection prevention (if applicable)
- Command injection prevention
- Input size limits

#### Network Security
- HTTPS enforcement for API calls
- Certificate validation
- Secure headers in requests

**Example Security Test**:
```python
# tests/security/test_input_validation.py
def test_malicious_text_input():
    malicious_inputs = [
        "<script>alert('xss')</script>",
        "'; DROP TABLE users; --",
        "$(rm -rf /)",
        "A" * 100000  # Very long input
    ]
    
    for malicious_input in malicious_inputs:
        result = process_text(malicious_input, "musical")
        
        # Should not execute malicious code
        assert "error" in result or "audio_url" in result
        # Should not crash or expose sensitive info
```

### 6. Browser Compatibility Testing

**Purpose**: Ensure extension works across different browsers and versions.

**Tools**: Selenium Grid, BrowserStack, or local browser testing

**Test Coverage**:
- Firefox (primary target)
- Chrome/Chromium compatibility
- Different browser versions
- Mobile browser testing (if applicable)

### 7. User Experience Testing

**Purpose**: Validate usability and user interaction flows.

**Test Coverage**:
- Extension installation and setup
- Options page functionality
- Context menu interactions
- Audio playback controls
- Error message clarity
- Loading states and progress indicators

## Test Data Management

### Test Fixtures
- Sample article texts of various lengths
- Mock API responses
- Test audio files
- Configuration files for different scenarios

### Environment Setup
- Development environment with mock APIs
- Staging environment with real APIs (limited usage)
- Production-like environment for final testing

## Continuous Integration

### Automated Testing Pipeline
1. **Unit Tests**: Run on every commit
2. **Integration Tests**: Run on pull requests
3. **E2E Tests**: Run on release candidates
4. **Performance Tests**: Run nightly
5. **Security Scans**: Run weekly

### Test Reporting
- Coverage reports for code coverage
- Performance metrics tracking
- Security vulnerability reports
- Browser compatibility matrices

## Test Implementation Guidelines

### Test-Driven Development (TDD)
Following the user's rule for test-driven development:

1. **Write tests first** for new features
2. **Run tests** to see them fail
3. **Implement code** to make tests pass
4. **Refactor** while keeping tests green
5. **Repeat** for each new feature

### Test Organization
```
tests/
├── unit/
│   ├── test_article_singer.py
│   ├── test_gpt_integration.py
│   └── test_suno_api.py
├── integration/
│   ├── test_native_messaging.py
│   └── test_api_integration.py
├── e2e/
│   ├── test_happy_path.js
│   └── test_error_scenarios.js
├── performance/
│   └── load_test.py
├── security/
│   └── test_input_validation.py
└── fixtures/
    ├── sample_articles.json
    └── mock_responses.json
```

## Getting Started with Testing

### Setup Test Environment
1. Install testing dependencies:
   ```bash
   pip install pytest pytest-asyncio pytest-mock
   npm install --save-dev jest selenium-webdriver
   ```

2. Configure test environment variables:
   ```bash
   export OPENAI_API_KEY="test_key"
   export PIAPI_KEY="test_key"
   export TEST_MODE="true"
   ```

3. Run tests:
   ```bash
   # Python tests
   pytest tests/unit/
   
   # JavaScript tests
   npm test
   
   # E2E tests
   npm run test:e2e
   ```

### Mock Services
- Mock OpenAI API responses
- Mock PiAPI/Suno API responses
- Mock browser native messaging
- Mock DOM elements for content script testing

This comprehensive testing strategy ensures the Article Song project is robust, secure, and provides a reliable user experience across different environments and use cases.

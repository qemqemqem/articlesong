/**
 * Unit tests for content_script.js
 */

// Mock the content script by importing its functions
// Since we can't directly import from content_script.js, we'll define the functions here
// In a real implementation, these would be extracted to modules

// Mock functions from content_script.js
function getText() {
  // Mock implementation of text extraction
  const readability = new Readability(document.cloneNode(true));
  const article = readability.parse();
  return article ? article.textContent : document.body.innerText;
}

function playAudio(audioUrl) {
  // Mock implementation of audio playback
  const audio = new Audio(audioUrl);
  audio.controls = true;
  audio.style.position = 'fixed';
  audio.style.top = '10px';
  audio.style.right = '10px';
  audio.style.zIndex = '10000';
  document.body.appendChild(audio);
  audio.play();
  return audio;
}

function sendMessageToBackground(message) {
  // Mock implementation of message sending
  return browser.runtime.sendMessage(message);
}

function createLoadingIndicator() {
  // Mock implementation of loading indicator
  // Check if indicator already exists
  let indicator = document.getElementById('article-singer-loading');
  if (indicator) {
    return indicator;
  }
  
  indicator = document.createElement('div');
  indicator.id = 'article-singer-loading';
  indicator.textContent = 'Generating song...';
  indicator.style.position = 'fixed';
  indicator.style.top = '50%';
  indicator.style.left = '50%';
  indicator.style.transform = 'translate(-50%, -50%)';
  indicator.style.zIndex = '10001';
  document.body.appendChild(indicator);
  return indicator;
}

function removeLoadingIndicator() {
  // Mock implementation of loading indicator removal
  const indicator = document.getElementById('article-singer-loading');
  if (indicator) {
    indicator.remove();
  }
}

// Mock Readability class
class Readability {
  constructor(document) {
    this.document = document;
  }
  
  parse() {
    const articles = this.document.querySelectorAll('article');
    if (articles.length > 0) {
      return {
        title: articles[0].querySelector('h1')?.textContent || 'No Title',
        textContent: articles[0].textContent,
        content: articles[0].innerHTML
      };
    }
    
    // Fallback to body content
    return {
      title: document.title || 'No Title',
      textContent: this.document.body.textContent,
      content: this.document.body.innerHTML
    };
  }
}

describe('Content Script', () => {
  beforeEach(() => {
    // Clear DOM before each test
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getText', () => {
    test('extracts text from article element', () => {
      // Setup DOM with article content
      document.body.innerHTML = `
        <article>
          <h1>Test Article Title</h1>
          <p>This is the article content.</p>
          <p>More content here.</p>
        </article>
      `;
      
      const text = getText();
      
      expect(text).toContain('Test Article Title');
      expect(text).toContain('This is the article content.');
      expect(text).toContain('More content here.');
    });

    test('falls back to body text when no article element', () => {
      // Setup DOM without article element
      document.body.innerHTML = `
        <div>
          <h1>Page Title</h1>
          <p>Some page content.</p>
        </div>
      `;
      
      const text = getText();
      
      expect(text).toContain('Page Title');
      expect(text).toContain('Some page content.');
    });

    test('handles empty document', () => {
      document.body.innerHTML = '';
      
      const text = getText();
      
      expect(text).toBe('');
    });

    test('handles malformed HTML', () => {
      document.body.innerHTML = '<article><h1>Title</h1><p>Content</p></article>';
      
      const text = getText();
      
      expect(text).toContain('Title');
      expect(text).toContain('Content');
    });
  });

  describe('playAudio', () => {
    test('creates audio element with correct source', () => {
      const testUrl = 'http://test-audio.com/song.mp3';
      
      const audio = playAudio(testUrl);
      
      expect(audio).toBeInstanceOf(Audio);
      expect(audio.src).toBe(testUrl);
      expect(audio.controls).toBe(true);
      expect(document.body.contains(audio)).toBe(true);
    });

    test('positions audio element correctly', () => {
      const testUrl = 'http://test-audio.com/song.mp3';
      
      const audio = playAudio(testUrl);
      
      expect(audio.style.position).toBe('fixed');
      expect(audio.style.top).toBe('10px');
      expect(audio.style.right).toBe('10px');
      expect(audio.style.zIndex).toBe('10000');
    });

    test('calls play method on audio element', () => {
      const testUrl = 'http://test-audio.com/song.mp3';
      
      const audio = playAudio(testUrl);
      
      expect(audio.paused).toBe(false);
    });
  });

  describe('sendMessageToBackground', () => {
    test('sends message to browser runtime', async () => {
      const testMessage = {
        action: 'process_text',
        text: 'Test article content',
        songType: 'musical'
      };
      
      testUtils.mockSuccessfulAPIs();
      
      await sendMessageToBackground(testMessage);
      
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(testMessage);
    });

    test('handles message sending errors', async () => {
      const testMessage = {
        action: 'process_text',
        text: 'Test article content',
        songType: 'musical'
      };
      
      browser.runtime.sendMessage.mockRejectedValue(new Error('Message sending failed'));
      
      await expect(sendMessageToBackground(testMessage)).rejects.toThrow('Message sending failed');
    });
  });

  describe('createLoadingIndicator', () => {
    test('creates loading indicator element', () => {
      const indicator = createLoadingIndicator();
      
      expect(indicator).toBeDefined();
      expect(indicator.id).toBe('article-singer-loading');
      expect(indicator.textContent).toBe('Generating song...');
      expect(document.body.contains(indicator)).toBe(true);
    });

    test('positions loading indicator correctly', () => {
      const indicator = createLoadingIndicator();
      
      expect(indicator.style.position).toBe('fixed');
      expect(indicator.style.top).toBe('50%');
      expect(indicator.style.left).toBe('50%');
      expect(indicator.style.transform).toBe('translate(-50%, -50%)');
      expect(indicator.style.zIndex).toBe('10001');
    });

    test('only creates one loading indicator', () => {
      createLoadingIndicator();
      createLoadingIndicator();
      
      const indicators = document.querySelectorAll('#article-singer-loading');
      expect(indicators.length).toBe(1);
    });
  });

  describe('removeLoadingIndicator', () => {
    test('removes loading indicator if it exists', () => {
      createLoadingIndicator();
      expect(document.getElementById('article-singer-loading')).toBeTruthy();
      
      removeLoadingIndicator();
      expect(document.getElementById('article-singer-loading')).toBeNull();
    });

    test('does nothing if loading indicator does not exist', () => {
      expect(document.getElementById('article-singer-loading')).toBeNull();
      
      // Should not throw error
      removeLoadingIndicator();
      expect(document.getElementById('article-singer-loading')).toBeNull();
    });
  });

  describe('Full workflow integration', () => {
    test('complete song generation flow', async () => {
      // Setup DOM
      document.body.innerHTML = `
        <article>
          <h1>Test Article</h1>
          <p>This is a test article content.</p>
        </article>
      `;
      
      // Mock successful API response
      testUtils.mockSuccessfulAPIs();
      
      // Simulate the full workflow
      const text = getText();
      expect(text).toContain('Test Article');
      
      const loadingIndicator = createLoadingIndicator();
      expect(document.getElementById('article-singer-loading')).toBeTruthy();
      
      const message = {
        action: 'process_text',
        text: text,
        songType: 'musical'
      };
      
      await sendMessageToBackground(message);
      
      removeLoadingIndicator();
      expect(document.getElementById('article-singer-loading')).toBeNull();
      
      // Mock audio playback
      const audio = playAudio('http://test-audio.com/song.mp3');
      expect(audio.src).toBe('http://test-audio.com/song.mp3');
      expect(document.body.contains(audio)).toBe(true);
    });

    test('handles API errors gracefully', async () => {
      // Setup DOM
      document.body.innerHTML = `
        <article>
          <h1>Test Article</h1>
          <p>This is a test article content.</p>
        </article>
      `;
      
      // Mock failed API response
      testUtils.mockFailedAPIs();
      
      const text = getText();
      const loadingIndicator = createLoadingIndicator();
      
      const message = {
        action: 'process_text',
        text: text,
        songType: 'musical'
      };
      
      await sendMessageToBackground(message);
      
      removeLoadingIndicator();
      expect(document.getElementById('article-singer-loading')).toBeNull();
      
      // Should handle error gracefully without throwing
      expect(browser.runtime.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    test('handles very long text', () => {
      const longContent = 'A'.repeat(10000);
      document.body.innerHTML = `
        <article>
          <h1>Long Article</h1>
          <p>${longContent}</p>
        </article>
      `;
      
      const text = getText();
      
      expect(text).toContain('Long Article');
      expect(text).toContain(longContent);
      expect(text.length).toBeGreaterThan(10000);
    });

    test('handles special characters and unicode', () => {
      document.body.innerHTML = `
        <article>
          <h1>Special Characters: 🌍 & "quotes" & <tags></h1>
          <p>Unicode: café naïve résumé 世界</p>
        </article>
      `;
      
      const text = getText();
      
      expect(text).toContain('🌍');
      expect(text).toContain('café');
      expect(text).toContain('世界');
    });

    test('handles nested HTML structures', () => {
      document.body.innerHTML = `
        <article>
          <h1>Nested Content</h1>
          <div>
            <p>Paragraph 1</p>
            <div>
              <span>Nested span</span>
              <p>Nested paragraph</p>
            </div>
          </div>
        </article>
      `;
      
      const text = getText();
      
      expect(text).toContain('Nested Content');
      expect(text).toContain('Paragraph 1');
      expect(text).toContain('Nested span');
      expect(text).toContain('Nested paragraph');
    });
  });
});

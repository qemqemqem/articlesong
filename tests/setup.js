// Jest setup file for browser extension testing
// This file is loaded before every test file

// Mock browser APIs that are not available in jsdom
global.browser = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    sendNativeMessage: jest.fn(),
    onStartup: {
      addListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  permissions: {
    request: jest.fn(),
    contains: jest.fn()
  }
};

// Mock chrome APIs (for compatibility)
global.chrome = global.browser;

// Mock console methods to avoid test output pollution
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Mock Audio API for audio playback tests
global.Audio = class {
  constructor(src) {
    this.src = src;
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.volume = 1;
    this.muted = false;
    this.onloadeddata = null;
    this.onended = null;
    this.onerror = null;
    this.controls = false;
    this.style = {
      position: '',
      top: '',
      right: '',
      left: '',
      bottom: '',
      zIndex: '',
      transform: ''
    };
    this.parentNode = null;
  }
  
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  
  pause() {
    this.paused = true;
  }
  
  load() {
    // Mock loading behavior
    setTimeout(() => {
      if (this.onloadeddata) {
        this.onloadeddata();
      }
    }, 0);
  }
};

// Mock fetch API for API integration tests
global.fetch = jest.fn();

// Mock native messaging
global.port = {
  postMessage: jest.fn(),
  onMessage: {
    addListener: jest.fn(),
    removeListener: jest.fn()
  },
  onDisconnect: {
    addListener: jest.fn()
  }
};

// Setup DOM environment for content script testing
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  
  // Reset fetch mock
  fetch.mockClear();
});

// Global test utilities
global.testUtils = {
  // Create a mock article DOM structure
  createMockArticle: (title = 'Test Article', content = 'Test content') => {
    const article = document.createElement('article');
    const h1 = document.createElement('h1');
    h1.textContent = title;
    const p = document.createElement('p');
    p.textContent = content;
    article.appendChild(h1);
    article.appendChild(p);
    return article;
  },
  
  // Wait for async operations
  waitFor: (condition, timeout = 1000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for condition'));
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  },
  
  // Mock successful API responses
  mockSuccessfulAPIs: () => {
    browser.runtime.sendNativeMessage.mockResolvedValue({
      success: true,
      audio_url: 'http://test-audio.com/song.mp3',
      lyrics: 'Test lyrics content'
    });
  },
  
  // Mock failed API responses
  mockFailedAPIs: () => {
    browser.runtime.sendNativeMessage.mockResolvedValue({
      error: 'API Error',
      message: 'Failed to generate song'
    });
  }
};

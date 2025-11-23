/**
 * Article Song - Background Script (Refactored)
 * Multi-request tracking, cancellation, history management
 * 
 * Flow:
 * 1. User clicks menu item → creates request
 * 2. Request goes through: RECEIVED → LYRICS → MUSIC → PLAYING → COMPLETE
 * 3. Status tracked in storage, broadcast to popup
 * 4. User can cancel, download, retry from popup
 */

// Load prompts
const script = document.createElement('script');
script.src = browser.runtime.getURL('prompts.js');
document.head.appendChild(script);

// API Keys (loaded from storage)
let ANTHROPIC_API_KEY = '';
let SUNO_API_KEY = '';

// Request tracking
const activeRequests = new Map(); // id -> { request, abortController, pollInterval }
let allRequests = []; // All requests (active + history)
let settings = {
  autoDownload: false,
  downloadDirectory: 'ArticleSongs',
  maxHistoryItems: 20,
  autoPlayOnComplete: true,
  showNotifications: true
};

const EXPECTED_DURATION = 60; // seconds

Logger.info('Article Song extension loaded! [VERSION: 2024-11-23-03:35 - RE-FIXED CALLBACK + PARSING]');

// ============================================================================
// STORAGE & INITIALIZATION
// ============================================================================

async function loadAPIKeys() {
  const result = await browser.storage.sync.get(['anthropic_api_key', 'suno_api_key']);
  ANTHROPIC_API_KEY = result.anthropic_api_key || '';
  SUNO_API_KEY = result.suno_api_key || '';
  Logger.success('API keys loaded', {
    anthropic: ANTHROPIC_API_KEY ? '✓' : '✗',
    suno: SUNO_API_KEY ? '✓' : '✗'
  });
}

async function loadRequests() {
  const result = await browser.storage.local.get(['requests', 'settings']);
  allRequests = result.requests || [];
  settings = { ...settings, ...(result.settings || {}) };
  Logger.info(`Loaded ${allRequests.length} requests from storage`);
}

async function saveRequests() {
  await browser.storage.local.set({ requests: allRequests });
  broadcastUpdate();
}

async function saveSettings() {
  await browser.storage.local.set({ settings });
}

loadAPIKeys();
loadRequests();

// Listen for storage changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.anthropic_api_key) {
      ANTHROPIC_API_KEY = changes.anthropic_api_key.newValue;
    }
    if (changes.suno_api_key) {
      SUNO_API_KEY = changes.suno_api_key.newValue;
    }
  }
  if (area === 'local' && changes.settings) {
    settings = { ...settings, ...changes.settings.newValue };
  }
});

// ============================================================================
// REQUEST MANAGEMENT
// ============================================================================

function createRequest(articleText, articleUrl, articleTitle, songStyle, tabId) {
  const request = {
    id: generateRequestId(),
    articleTitle,
    articleUrl,
    articleText,
    songStyle,
    status: 'RECEIVED',
    progress: {
      elapsed: 0,
      estimated: EXPECTED_DURATION
    },
    timestamps: {
      created: Date.now(),
      completed: null
    },
    audioUrl: null,
    lyrics: null,
    styleTags: null,
    error: null,
    sunoTaskId: null,
    tabId
  };
  
  allRequests.unshift(request);
  pruneHistory();
  saveRequests();
  updateBadge();
  
  Logger.info(`Created request ${request.id} for "${articleTitle}"`);
  return request;
}

function updateRequest(requestId, updates) {
  const request = allRequests.find(r => r.id === requestId);
  if (request) {
    Object.assign(request, updates);
    
    // Update elapsed time
    if (request.status === 'LYRICS' || request.status === 'MUSIC') {
      request.progress.elapsed = Math.floor((Date.now() - request.timestamps.created) / 1000);
    }
    
    saveRequests();
  }
}

function getRequest(requestId) {
  return allRequests.find(r => r.id === requestId);
}

function generateRequestId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function pruneHistory() {
  const completedRequests = allRequests.filter(r => 
    ['COMPLETE', 'FAILED', 'CANCELLED'].includes(r.status)
  );
  
  if (completedRequests.length > settings.maxHistoryItems) {
    const toRemove = completedRequests.slice(settings.maxHistoryItems);
    toRemove.forEach(req => {
      const index = allRequests.indexOf(req);
      if (index > -1) {
        allRequests.splice(index, 1);
      }
    });
  }
}

function broadcastUpdate() {
  browser.runtime.sendMessage({ action: 'requestsUpdated' }).catch(() => {
    // Popup might be closed, ignore error
  });
}

// ============================================================================
// CLAUDE API - Generate Lyrics
// ============================================================================

async function generateLyrics(request, abortController) {
  Logger.info(`Generating ${request.songStyle} lyrics for ${request.id}...`);
  
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured. Please set it in extension options.');
  }
  
  // Special case: "straight" means use article text directly
  if (request.songStyle === "straight") {
    return request.articleText;
  }
  
  const prompt = getLyricsPrompt(request.articleText, request.songStyle);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 700,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }),
    signal: abortController.signal
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  const lyrics = data.content[0].text.trim();
  
  Logger.success(`Lyrics generated for ${request.id} (${lyrics.length} chars)`);
  return lyrics;
}

async function generateStyleTags(lyrics, songStyle, abortController) {
  Logger.info(`Generating style tags for ${songStyle}...`);
  
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }
  
  const prompt = getStyleTagsPrompt(lyrics, songStyle);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 50,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }),
    signal: abortController.signal
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  const tags = data.content[0].text.trim();
  const trimmedTags = tags.substring(0, 120);
  
  Logger.success(`Style tags generated: "${trimmedTags}"`);
  return trimmedTags;
}

// ============================================================================
// SUNO API - Generate Music
// ============================================================================

async function generateMusic(request, abortController) {
  Logger.info(`Sending to Suno API...`, { requestId: request.id });
  
  if (!SUNO_API_KEY) {
    throw new Error('SunoAPI key not configured. Please set it in extension options.');
  }
  
  const requestBody = {
    callBackUrl: "https://webhook.site/unique-uuid-here",
    customMode: true,
    instrumental: false,
    model: 'V5',
    prompt: request.lyrics.substring(0, 5000),
    style: request.styleTags.substring(0, 1000),
    title: request.articleTitle.substring(0, 80)
  };
  
  Logger.debug('Suno API request', requestBody);
  
  const response = await fetch('https://api.sunoapi.org/api/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUNO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    signal: abortController.signal
  });
  
  if (!response.ok) {
    const error = await response.text();
    Logger.error(`Suno API HTTP error: ${response.status}`, { error });
    throw new Error(`Suno API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  Logger.debug('Suno API response', data);
  
  if (!data || data.code !== 200) {
    Logger.error('Suno API returned error', data);
    throw new Error(`Suno API error: ${data?.msg || 'Unknown error'}`);
  }
  
  if (!data.data || !data.data.taskId) {
    Logger.error('Suno API missing taskId', data);
    throw new Error(`Suno API returned unexpected response structure`);
  }
  
  const taskId = data.data.taskId;
  Logger.success(`Suno task started: ${taskId}`);
  return taskId;
}

async function pollSunoStatus(taskId, abortController) {
  Logger.debug(`Checking Suno status for ${taskId}...`);
  
  const response = await fetch(
    `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`,
    {
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`
      },
      signal: abortController.signal
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    Logger.error(`Suno status check HTTP error: ${response.status}`, { error });
    throw new Error(`Suno status check failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data || data.code !== 200) {
    Logger.error('Suno status check returned error', data);
    throw new Error(`Suno status error: ${data?.msg || 'Unknown error'}`);
  }
  
  return data.data;
}

async function waitForSunoCompletion(request, abortController) {
  const maxAttempts = 48; // 4 minutes max (48 * 5s)
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        // Check if cancelled
        if (abortController.signal.aborted) {
          clearInterval(pollInterval);
          reject(new Error('Cancelled'));
          return;
        }
        
        const statusData = await pollSunoStatus(request.sunoTaskId, abortController);
        
        Logger.debug(`Poll attempt ${attempts + 1}/${maxAttempts}`, { 
          status: statusData.status,
          taskId: statusData.taskId
        });
        
        if (statusData.status === 'SUCCESS') {
          clearInterval(pollInterval);
          
          if (!statusData.response || !statusData.response.sunoData || !statusData.response.sunoData[0]) {
            Logger.error('Suno SUCCESS but missing data', { statusData });
            reject(new Error('Suno returned SUCCESS but no audio data found'));
            return;
          }
          
          const song = statusData.response.sunoData[0];
          Logger.success(`Song ready: ${song.title}`, { audioUrl: song.audioUrl });
          resolve({
            audioUrl: song.audioUrl,
            imageUrl: song.imageUrl,
            title: song.title,
            lyrics: song.prompt
          });
        } else if (statusData.status === 'FAILED') {
          clearInterval(pollInterval);
          Logger.error('Suno generation failed', { statusData });
          reject(new Error('Suno generation failed'));
        }
        
        attempts++;
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error('Suno generation timeout (4 minutes)'));
        }
        
        // Update progress
        updateRequest(request.id, {
          progress: {
            elapsed: Math.floor((Date.now() - request.timestamps.created) / 1000),
            estimated: EXPECTED_DURATION
          }
        });
        updateBadge();
        
      } catch (error) {
        clearInterval(pollInterval);
        reject(error);
      }
    }, 5000);
    
    // Store interval for cancellation
    const requestState = activeRequests.get(request.id);
    if (requestState) {
      requestState.pollInterval = pollInterval;
    }
  });
}

// ============================================================================
// MAIN FLOW - Orchestrate Everything
// ============================================================================

async function generateSongFromArticle(request) {
  Logger.info('═══════════════════════════════════════════════════════');
  Logger.info(`Starting song generation: ${request.songStyle}`, {
    requestId: request.id,
    pageTitle: request.articleTitle,
    textLength: request.articleText.length
  });
  
  const abortController = new AbortController();
  activeRequests.set(request.id, { request, abortController, pollInterval: null });
  
  try {
    // Step 1: Generate lyrics with Claude
    updateRequest(request.id, { status: 'LYRICS' });
    const lyrics = await generateLyrics(request, abortController);
    updateRequest(request.id, { lyrics });
    
    // Step 2: Generate style tags with Claude
    const styleTags = await generateStyleTags(lyrics, request.songStyle, abortController);
    updateRequest(request.id, { styleTags });
    
    // Step 3: Send to Suno
    updateRequest(request.id, { status: 'MUSIC' });
    const taskId = await generateMusic(request, abortController);
    updateRequest(request.id, { sunoTaskId: taskId });
    
    // Step 4: Poll for completion
    const result = await waitForSunoCompletion(request, abortController);
    
    // Success!
    updateRequest(request.id, {
      status: 'PLAYING',
      audioUrl: result.audioUrl,
      progress: { elapsed: 0, estimated: 0 }
    });
    
    Logger.success('SONG GENERATION COMPLETE!', {
      requestId: request.id,
      audioUrl: result.audioUrl
    });
    Logger.info('═══════════════════════════════════════════════════════');
    
    // Auto-download if enabled
    if (settings.autoDownload) {
      downloadAudio(request.id);
    }
    
    // Send to content script
    await forwardAudioUrlToContentScript(request.tabId, result.audioUrl, request.id);
    
    updateBadge();
    
    if (settings.showNotifications) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/songify.png'),
        title: 'Song Ready!',
        message: `"${request.articleTitle}" is now playing`
      });
    }
    
    return result.audioUrl;
    
  } catch (error) {
    if (error.message === 'Cancelled') {
      Logger.info(`Request ${request.id} cancelled by user`);
      updateRequest(request.id, { 
        status: 'CANCELLED',
        error: 'Cancelled by user'
      });
    } else {
      Logger.error('Song generation failed', {
        error: error.message,
        requestId: request.id
      });
      
      updateRequest(request.id, {
        status: 'FAILED',
        error: error.message
      });
      
      if (settings.showNotifications) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/songify.png'),
          title: 'Song Generation Failed',
          message: error.message
        });
      }
    }
    
    updateBadge();
    throw error;
    
  } finally {
    activeRequests.delete(request.id);
  }
}

// ============================================================================
// CONTENT SCRIPT COMMUNICATION
// ============================================================================

async function forwardAudioUrlToContentScript(tabId, audioUrl, requestId) {
  if (!tabId) {
    Logger.error('No tab ID for request');
    return;
  }
  
  try {
    const isReady = await browser.tabs.sendMessage(tabId, {action: "ping"}).catch(() => false);
    
    if (isReady) {
      await browser.tabs.sendMessage(tabId, {
        action: "playAudio", 
        url: audioUrl,
        requestId: requestId
      });
      Logger.success('Audio URL sent to content script', { audioUrl });
    } else {
      Logger.warning('Content script not ready, retrying...');
      setTimeout(() => forwardAudioUrlToContentScript(tabId, audioUrl, requestId), 1000);
    }
  } catch (error) {
    Logger.error('Error sending message to content script', error);
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateBadge() {
  const activeCount = allRequests.filter(r => 
    ['RECEIVED', 'LYRICS', 'MUSIC', 'PLAYING'].includes(r.status)
  ).length;
  
  if (activeCount > 0) {
    browser.browserAction.setBadgeText({ text: activeCount.toString() });
    browser.browserAction.setBadgeBackgroundColor({ color: "#667eea" });
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

// ============================================================================
// MESSAGE HANDLERS (from popup and content script)
// ============================================================================

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  if (message.action === 'getRequests') {
    sendResponse({ requests: allRequests, settings });
    return true;
  }
  
  if (message.action === 'cancelRequest') {
    const requestState = activeRequests.get(message.requestId);
    if (requestState) {
      requestState.abortController.abort();
      if (requestState.pollInterval) {
        clearInterval(requestState.pollInterval);
      }
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'downloadRequest') {
    downloadAudio(message.requestId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'playAgain') {
    const request = getRequest(message.requestId);
    if (request && request.audioUrl) {
      browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
        if (tabs[0]) {
          forwardAudioUrlToContentScript(tabs[0].id, request.audioUrl, request.id);
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'retryRequest') {
    const request = getRequest(message.requestId);
    if (request) {
      // Create new request with same parameters
      browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
        if (tabs[0]) {
          const newRequest = createRequest(
            request.articleText,
            request.articleUrl,
            request.articleTitle,
            request.songStyle,
            tabs[0].id
          );
          generateSongFromArticle(newRequest);
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'clearHistory') {
    allRequests = allRequests.filter(r => 
      ['RECEIVED', 'LYRICS', 'MUSIC', 'PLAYING'].includes(r.status)
    );
    saveRequests();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'audioEnded') {
    updateRequest(message.requestId, {
      status: 'COMPLETE',
      timestamps: {
        ...getRequest(message.requestId).timestamps,
        completed: Date.now()
      }
    });
    updateBadge();
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// ============================================================================
// DOWNLOAD MANAGEMENT
// ============================================================================

function downloadAudio(requestId) {
  const request = getRequest(requestId);
  if (!request || !request.audioUrl) {
    Logger.error('Cannot download: no audio URL', { requestId });
    return;
  }
  
  // Build filename: use subdirectory if specified, otherwise download directly to Downloads
  const sanitizedTitle = sanitizeFilename(request.articleTitle);
  const filename = settings.downloadDirectory 
    ? `${settings.downloadDirectory}/${sanitizedTitle}.mp3`
    : `${sanitizedTitle}.mp3`;
  
  browser.downloads.download({
    url: request.audioUrl,
    filename: filename,
    saveAs: false
  }).then(() => {
    Logger.success(`Downloaded: ${filename}`);
  }).catch(error => {
    Logger.error('Download failed', error);
  });
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// ============================================================================
// MENU ITEMS
// ============================================================================

browser.menus.create({
  id: "musical-song",
  title: "Musical Song (default)",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "spoken-word-song",
  title: "Spoken Word Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "meme-song",
  title: "Meme Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "cute-song",
  title: "Cute Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "informative-song",
  title: "Informative Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "straight-lyrics",
  title: "Use Page Text as Lyrics",
  contexts: ["browser_action"]
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================

browser.menus.onClicked.addListener(async (info, tab) => {
  try {
    const content = await browser.tabs.sendMessage(tab.id, {action: "getText"});
    
    if (!content) {
      Logger.error('Failed to get page content from tab');
      return;
    }
    
    let songStyle;
    switch (info.menuItemId) {
      case "spoken-word-song": songStyle = "spoken"; break;
      case "musical-song": songStyle = "musical"; break;
      case "meme-song": songStyle = "meme"; break;
      case "cute-song": songStyle = "cute"; break;
      case "informative-song": songStyle = "informative"; break;
      case "straight-lyrics": songStyle = "straight"; break;
      default: songStyle = "musical";
    }
    
    const request = createRequest(content.text, tab.url, tab.title, songStyle, tab.id);
    await generateSongFromArticle(request);
    
  } catch (error) {
    Logger.error('Menu click handler error', error);
  }
});

Logger.success('Background script ready! All systems initialized. [VERSION: 2024-11-23-03:35]');

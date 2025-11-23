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
  showNotifications: true,
  sunoModel: 'V5'
};

const EXPECTED_DURATION = 180; // seconds (3 min typical for V5)

Logger.info('Article Song extension loaded! [VERSION: 2024-11-23-05:07 - PRODUCTION MODE]');

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
    lyricsProvider: null, // Track which service generated lyrics ('anthropic' or 'suno')
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
// SUNO API - Generate Lyrics
// ============================================================================

async function generateLyricsWithSuno(request, abortController) {
  Logger.info(`Generating ${request.songStyle} lyrics with SunoAPI for ${request.id}...`);
  
  if (!SUNO_API_KEY) {
    openSettingsWithError('suno_missing');
    throw new Error('SunoAPI key not configured. Please set it in extension options.');
  }
  
  // Mark that we're using SunoAPI for lyrics
  updateRequest(request.id, { lyricsProvider: 'suno' });
  
  // Special case: "straight" means use article text directly
  if (request.songStyle === "straight") {
    return request.articleText;
  }
  
  // Build prompt for SunoAPI lyrics generation
  const prompt = buildSunoLyricsPrompt(request.articleText, request.songStyle);
  
  const response = await fetch('https://api.sunoapi.org/api/v1/lyrics', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUNO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      callBackUrl: "https://webhook.site/unique-uuid-here",
      prompt: prompt.substring(0, 200) // Max 200 words
    }),
    signal: abortController.signal
  });
  
  if (!response.ok) {
    const error = await response.text();
    Logger.error(`SunoAPI lyrics HTTP error: ${response.status}`, { error });
    if (response.status === 401 || response.status === 403) {
      openSettingsWithError('suno_invalid');
    }
    throw new Error(`SunoAPI lyrics error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  Logger.debug('SunoAPI lyrics response', data);
  
  if (!data || data.code !== 200) {
    Logger.error('SunoAPI lyrics returned error', data);
    throw new Error(`SunoAPI lyrics error: ${data?.msg || 'Unknown error'}`);
  }
  
  if (!data.data || !data.data.taskId) {
    Logger.error('SunoAPI lyrics missing taskId', data);
    throw new Error(`SunoAPI lyrics returned unexpected response structure`);
  }
  
  const taskId = data.data.taskId;
  Logger.success(`SunoAPI lyrics task started: ${taskId}`);
  
  // Wait for lyrics to be ready
  const lyrics = await waitForSunoLyrics(taskId, abortController);
  
  Logger.success(`Lyrics generated with SunoAPI for ${request.id} (${lyrics.length} chars)`);
  return lyrics;
}

async function pollSunoLyricsStatus(taskId, abortController) {
  Logger.debug(`Checking SunoAPI lyrics status for ${taskId}...`);
  
  const response = await fetch(
    `https://api.sunoapi.org/api/v1/lyrics/record-info?taskId=${taskId}`,
    {
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`
      },
      signal: abortController.signal
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    Logger.error(`SunoAPI lyrics status check HTTP error: ${response.status}`, { error });
    throw new Error(`SunoAPI lyrics status check failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data || data.code !== 200) {
    Logger.error('SunoAPI lyrics status check returned error', data);
    throw new Error(`SunoAPI lyrics status error: ${data?.msg || 'Unknown error'}`);
  }
  
  return data.data;
}

async function waitForSunoLyrics(taskId, abortController) {
  const maxAttempts = 40; // 2 minutes max (40 * 3s) - lyrics generate faster
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        if (abortController.signal.aborted) {
          clearInterval(pollInterval);
          reject(new Error('Cancelled'));
          return;
        }
        
        const statusData = await pollSunoLyricsStatus(taskId, abortController);
        
        Logger.debug(`Lyrics poll attempt ${attempts + 1}/${maxAttempts}`, { 
          status: statusData.status,
          taskId: statusData.taskId,
          hasResponse: !!statusData.response,
          hasData: !!(statusData.response && statusData.response.data)
        });
        
        if (statusData.status === 'SUCCESS' && statusData.response && statusData.response.data) {
          clearInterval(pollInterval);
          
          // SunoAPI returns multiple lyric variations - pick the first one
          const lyricsVariations = statusData.response.data;
          
          if (!lyricsVariations || lyricsVariations.length === 0) {
            reject(new Error('SunoAPI returned SUCCESS but no lyrics data'));
            return;
          }
          
          Logger.success(`SunoAPI lyrics ready! Got ${lyricsVariations.length} variations`);
          
          // Use the first variation
          const selectedLyrics = lyricsVariations[0];
          resolve(selectedLyrics.text);
          return;
        } else if (statusData.status === 'FAILED') {
          clearInterval(pollInterval);
          Logger.error('SunoAPI lyrics generation failed', { statusData });
          reject(new Error('SunoAPI lyrics generation failed'));
          return;
        }
        
        attempts++;
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error('SunoAPI lyrics generation timeout (2 minutes)'));
        }
        
      } catch (error) {
        clearInterval(pollInterval);
        reject(error);
      }
    }, 3000);
  });
}

function buildSunoLyricsPrompt(articleText, songStyle) {
  // Build a concise prompt for SunoAPI lyrics generation
  let prompt = `A song about: ${articleText.substring(0, 300)}. `;
  
  switch(songStyle) {
    case "spoken":
      prompt += "Style: Spoken word, rhythmic, poetry slam.";
      break;
    case "musical":
      prompt += "Style: Traditional musical with verse-chorus structure.";
      break;
    case "meme":
      prompt += "Style: Funny, catchy, internet-culture friendly.";
      break;
    case "cute":
      prompt += "Style: Cute, uplifting, cheerful.";
      break;
    case "informative":
      prompt += "Style: Educational, factual, clear.";
      break;
    default:
      prompt += "Style: Balanced article-to-song.";
  }
  
  return prompt;
}

function getFallbackStyleTags(songStyle) {
  // Simple fallback style tags when Anthropic is not available
  switch(songStyle) {
    case "spoken":
      return "Spoken Word, Hip-Hop, Rhythmic Storytelling, 90 BPM, Clear Delivery";
    case "musical":
      return "Pop Musical, Upbeat, Catchy, 120 BPM, Piano, Bright Vocals";
    case "meme":
      return "Comedy Rap, Novelty Pop, Energetic, 128 BPM, Quirky Synths";
    case "cute":
      return "Indie Pop, Dreamy, Upbeat, Warm Synths, Sweet Vocals";
    case "informative":
      return "Educational Folk, Clear, 95 BPM, Acoustic Guitar, Narrative";
    default:
      return "Indie Pop, Melodic, 110 BPM, Balanced, Contemporary";
  }
}

// ============================================================================
// CLAUDE API - Generate Lyrics
// ============================================================================

async function generateLyrics(request, abortController) {
  Logger.info(`Generating ${request.songStyle} lyrics for ${request.id}...`);
  
  // Check if Anthropic key is available, otherwise use SunoAPI
  if (!ANTHROPIC_API_KEY) {
    Logger.info('No Anthropic key, falling back to SunoAPI lyrics generation');
    return await generateLyricsWithSuno(request, abortController);
  }
  
  // Mark that we're using Anthropic for lyrics
  updateRequest(request.id, { lyricsProvider: 'anthropic' });
  
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
      system: LYRICS_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }),
    signal: abortController.signal
  });
  
  if (!response.ok) {
    const error = await response.text();
    if (response.status === 401 || response.status === 403) {
      openSettingsWithError('anthropic_invalid');
    }
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  const lyrics = data.content[0].text.trim();
  
  Logger.success(`Lyrics generated for ${request.id} (${lyrics.length} chars)`);
  return lyrics;
}

async function generateStyleTags(lyrics, songStyle, abortController) {
  Logger.info(`Generating style tags for ${songStyle}...`);
  
  // If no Anthropic key, use simple fallback style tags
  if (!ANTHROPIC_API_KEY) {
    Logger.info('No Anthropic key, using fallback style tags');
    return getFallbackStyleTags(songStyle);
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
      system: STYLE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }),
    signal: abortController.signal
  });
  
  if (!response.ok) {
    const error = await response.text();
    if (response.status === 401 || response.status === 403) {
      openSettingsWithError('anthropic_invalid');
    }
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
  const model = settings.sunoModel || 'V5';
  Logger.info(`Sending to Suno API...`, { requestId: request.id, model });
  
  if (!SUNO_API_KEY) {
    openSettingsWithError('suno_missing');
    throw new Error('SunoAPI key not configured. Please set it in extension options.');
  }
  
  const requestBody = {
    callBackUrl: "https://webhook.site/unique-uuid-here",
    customMode: true,
    instrumental: false,
    model: model,
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
    if (response.status === 401 || response.status === 403) {
      openSettingsWithError('suno_invalid');
    }
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
  const maxAttempts = 96; // 8 minutes max (96 * 5s) - V5 can take longer
  let attempts = 0;
  let streamingUrlDelivered = false;
  
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
          taskId: statusData.taskId,
          hasResponse: !!statusData.response,
          hasSunoData: !!(statusData.response && statusData.response.sunoData),
          sunoDataLength: statusData.response?.sunoData?.length || 0
        });
        
        // Check if we have any audio data available (streaming or complete)
        if (statusData.response && statusData.response.sunoData && statusData.response.sunoData[0]) {
          const song = statusData.response.sunoData[0];
          
          Logger.debug(`Audio data available:`, {
            hasAudioUrl: !!song.audioUrl,
            audioUrl: song.audioUrl ? song.audioUrl.substring(0, 50) + '...' : null,
            streamingDelivered: streamingUrlDelivered
          });
          
          // STREAMING: Check if streaming URL is available (ready in ~30-40 seconds)
          if (!streamingUrlDelivered && song.audioUrl) {
            Logger.success(`🎵 Streaming URL ready! Starting playback...`, { 
              audioUrl: song.audioUrl,
              title: song.title 
            });
            
            streamingUrlDelivered = true;
            
            // Start playback immediately with streaming URL
            updateRequest(request.id, {
              status: 'PLAYING',
              audioUrl: song.audioUrl,
              imageUrl: song.imageUrl,
              title: song.title,
              lyrics: song.prompt,
              isStreaming: true,
              progress: { elapsed: 0, estimated: 0 }
            });
            
            // Send to content script right away
            forwardAudioUrlToContentScript(request.tabId, song.audioUrl, request.id).catch(err => {
              Logger.warn('Could not forward to content script', err);
            });
            
            // Show notification if enabled
            if (settings.showNotifications) {
              browser.notifications.create({
                type: 'basic',
                iconUrl: browser.runtime.getURL('icons/songify.png'),
                title: 'Song Streaming!',
                message: `"${song.title || request.articleTitle}" is now playing`
              });
            }
            
            updateBadge();
            
            // SunoAPI.org provides full quality in audioUrl, no separate download URL
            Logger.info('Audio ready, continuing to poll for SUCCESS status...');
          }
        }
        
        // Check for success - but only if we have an audio URL
        if (statusData.status === 'SUCCESS' || statusData.status === 'TEXT_SUCCESS') {
          
          if (!statusData.response || !statusData.response.sunoData || !statusData.response.sunoData[0]) {
            Logger.error('Suno SUCCESS but missing data', { statusData });
            reject(new Error('Suno returned SUCCESS but no audio data found'));
            clearInterval(pollInterval);
            return;
          }
          
          const song = statusData.response.sunoData[0];
          
          // TEXT_SUCCESS can appear before audio is ready - check if we have URL
          if (!song.audioUrl || song.audioUrl.trim() === '') {
            Logger.debug(`Status ${statusData.status} but no audio URL yet, continuing to poll...`);
            attempts++;
            if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              reject(new Error('Suno generation timeout (8 minutes)'));
            }
            return; // Keep polling
          }
          
          clearInterval(pollInterval);
          Logger.success(`Song ready: ${song.title}`, { audioUrl: song.audioUrl });
          
          // If we never got a streaming URL, deliver it now
          if (!streamingUrlDelivered) {
            updateRequest(request.id, {
              status: 'PLAYING',
              audioUrl: song.audioUrl,
              imageUrl: song.imageUrl,
              title: song.title,
              lyrics: song.prompt,
              isStreaming: false, // Full quality ready
              progress: { elapsed: 0, estimated: 0 }
            });
          } else {
            // We already started streaming, now mark as complete
            updateRequest(request.id, {
              isStreaming: false // Full quality ready
            });
          }
          
          resolve({
            audioUrl: song.audioUrl,
            imageUrl: song.imageUrl,
            title: song.title,
            lyrics: song.prompt
          });
          return;
        } else if (statusData.status === 'FAILED') {
          clearInterval(pollInterval);
          Logger.error('Suno generation failed', { statusData });
          reject(new Error('Suno generation failed'));
        }
        
        attempts++;
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error('Suno generation timeout (8 minutes)'));
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
    
    // Step 4: Poll for completion (will start streaming as soon as available)
    const result = await waitForSunoCompletion(request, abortController);
    
    // Note: waitForSunoCompletion already set status to PLAYING when streaming URL became available
    // We're here when download URL is ready (or SUCCESS status received)
    
    Logger.success('SONG GENERATION COMPLETE!', {
      requestId: request.id,
      audioUrl: result.audioUrl
    });
    Logger.info('═══════════════════════════════════════════════════════');
    
    // Auto-download if enabled
    if (settings.autoDownload) {
      Logger.info('Auto-download enabled, downloading song...', { 
        directory: settings.downloadDirectory 
      });
      downloadAudio(request.id);
    }
    
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
// SETTINGS ERROR HANDLING
// ============================================================================

function openSettingsWithError(errorType) {
  // Store error in local storage so settings page can display it
  browser.storage.local.set({ settingsError: errorType }).then(() => {
    browser.runtime.openOptionsPage();
  });
}

// ============================================================================
// MESSAGE HANDLERS (from popup and content script)
// ============================================================================

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  if (message.action === 'getRequests') {
    sendResponse({ requests: allRequests, settings });
    return true;
  }
  
  if (message.action === 'createSong') {
    // Handle song creation from popup
    (async () => {
      try {
        let articleText;
        
        // Use selected text if provided, otherwise get full page content
        if (message.useSelection && message.selectedText) {
          articleText = message.selectedText;
          Logger.info(`Using ${message.selectedText.split(/\s+/).length} words of selected text`);
        } else {
          const content = await browser.tabs.sendMessage(message.tabId, {action: "getText"});
          if (!content) {
            throw new Error('Failed to get page content');
          }
          articleText = content.text;
        }
        
        const request = createRequest(
          articleText, 
          message.tabUrl, 
          message.tabTitle, 
          message.songStyle, 
          message.tabId
        );
        
        generateSongFromArticle(request);
        sendResponse({ success: true, requestId: request.id });
      } catch (error) {
        Logger.error('Failed to create song from popup', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
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
  
  if (message.action === 'stopPlaying') {
    const request = getRequest(message.requestId);
    if (request && request.status === 'PLAYING') {
      updateRequest(message.requestId, {
        status: 'COMPLETE',
        timestamps: {
          ...request.timestamps,
          completed: Date.now()
        }
      });
      
      // Try to stop audio in content script
      if (request.tabId) {
        browser.tabs.sendMessage(request.tabId, {
          action: 'stopAudio',
          requestId: message.requestId
        }).catch(() => {
          // Tab might be closed, ignore error
        });
      }
      
      updateBadge();
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'togglePlayPause') {
    const request = getRequest(message.requestId);
    Logger.debug('Toggle play/pause request', { requestId: message.requestId, hasRequest: !!request, status: request?.status, tabId: request?.tabId });
    
    if (request && request.status === 'PLAYING' && request.tabId) {
      // Forward to content script
      Logger.debug('Forwarding to content script', { tabId: request.tabId });
      browser.tabs.sendMessage(request.tabId, {
        action: 'togglePlayPause',
        requestId: message.requestId
      }).then((response) => {
        Logger.debug('Content script response', response);
        sendResponse(response);
      }).catch((error) => {
        Logger.error('Failed to toggle playback', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open
    }
    Logger.error('Cannot toggle playback - invalid state', { hasRequest: !!request, status: request?.status, hasTabId: !!request?.tabId });
    sendResponse({ success: false, error: 'Request not playing or tab not found' });
    return true;
  }
  
  if (message.action === 'validatePlaying') {
    const request = getRequest(message.requestId);
    if (request && request.status === 'PLAYING' && request.tabId) {
      // Check if tab still exists and audio is playing
      browser.tabs.sendMessage(request.tabId, {
        action: 'checkAudioStatus',
        requestId: message.requestId
      }).then((response) => {
        sendResponse(response);
      }).catch((error) => {
        Logger.error('Failed to validate playing status', error);
        // Tab probably closed or refreshed
        sendResponse({ isPlaying: false, error: error.message });
      });
      return true; // Keep channel open
    }
    sendResponse({ isPlaying: false, error: 'Request not in playing state' });
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
  
  Logger.info('Starting download...', { 
    filename, 
    audioUrl: request.audioUrl.substring(0, 50) + '...',
    downloadDirectory: settings.downloadDirectory
  });
  
  browser.downloads.download({
    url: request.audioUrl,
    filename: filename,
    saveAs: false
  }).then((downloadId) => {
    Logger.success(`Download started with ID: ${downloadId}`, { filename });
  }).catch(error => {
    Logger.error('Download failed', { 
      error: error.message,
      filename,
      audioUrl: request.audioUrl.substring(0, 50) + '...'
    });
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

Logger.success('Background script ready! All systems initialized. [VERSION: 2024-11-23-05:07]');

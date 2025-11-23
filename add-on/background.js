/**
 * Article Song - Background Script
 * Browser-only version using SunoAPI.org + Anthropic Claude
 * 
 * Flow:
 * 1. User clicks extension button or menu item
 * 2. Get article text from content script
 * 3. Call Claude API to generate lyrics
 * 4. Call SunoAPI.org to generate music
 * 5. Poll for completion
 * 6. Play audio in content script
 */

// Load prompts
const script = document.createElement('script');
script.src = browser.runtime.getURL('prompts.js');
document.head.appendChild(script);

// API Keys (loaded from storage)
let ANTHROPIC_API_KEY = '';
let SUNO_API_KEY = '';

// Current song state
let currentSong = {
  title: "",
  style: "",
  state: "idle", // idle, generating_lyrics, generating_music, playing
  url: "",
  lyrics: "",
  taskId: ""
};

// Track start time and elapsed time
let startTime = null;
let elapsedTimeInterval = null;
let requestingTabId = null;

const EXPECTED_DURATION = 60; // seconds

Logger.info('Article Song extension loaded! [VERSION: 2024-11-23-03:28 - FIXED RESPONSE PARSING]');

// Load API keys from storage
function loadAPIKeys() {
  browser.storage.sync.get(['anthropic_api_key', 'suno_api_key']).then((result) => {
    ANTHROPIC_API_KEY = result.anthropic_api_key || '';
    SUNO_API_KEY = result.suno_api_key || '';
    Logger.success('API keys loaded', {
      anthropic: ANTHROPIC_API_KEY ? '✓' : '✗',
      suno: SUNO_API_KEY ? '✓' : '✗'
    });
  }, (error) => Logger.error('Failed to load API keys', error));
}

loadAPIKeys();

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
});

// ============================================================================
// CLAUDE API - Generate Lyrics
// ============================================================================

async function generateLyrics(articleText, songStyle) {
  Logger.info(`Generating ${songStyle} lyrics...`);
  
  if (!ANTHROPIC_API_KEY) {
    const error = 'Anthropic API key not configured. Please set it in extension options.';
    Logger.error(error);
    throw new Error(error);
  }
  
  // Special case: "straight" means use article text directly
  if (songStyle === "straight") {
    return articleText;
  }
  
  // Get prompt from prompts.js
  const prompt = getLyricsPrompt(articleText, songStyle);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true' // Required for browser requests
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  const lyrics = data.content[0].text.trim();
  
  Logger.success(`Lyrics generated (${lyrics.length} chars)`, { preview: lyrics.substring(0, 100) + '...' });
  return lyrics;
}

async function generateStyleTags(lyrics, songStyle) {
  Logger.info(`Generating style tags for ${songStyle}...`);
  
  if (!ANTHROPIC_API_KEY) {
    const error = 'Anthropic API key not configured';
    Logger.error(error);
    throw new Error(error);
  }
  
  const prompt = getStyleTagsPrompt(lyrics, songStyle);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true' // Required for browser requests
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  const tags = data.content[0].text.trim();
  
  // Trim to 120 chars as required by Suno
  const trimmedTags = tags.substring(0, 120);
  
  Logger.success(`Style tags generated: "${trimmedTags}"`);
  return trimmedTags;
}

// ============================================================================
// SUNO API - Generate Music
// ============================================================================

async function generateMusic(lyrics, styleTags, title) {
  Logger.info(`Sending to Suno API...`, { title, styleTags });
  
  if (!SUNO_API_KEY) {
    const error = 'SunoAPI key not configured. Please set it in extension options.';
    Logger.error(error);
    throw new Error(error);
  }
  
  // Official SunoAPI.org format for custom mode with lyrics
  const requestBody = {
    customMode: true,
    instrumental: false,
    model: 'V5',
    prompt: lyrics.substring(0, 5000), // V5 limit: 5000 chars
    style: styleTags.substring(0, 1000), // V5 limit: 1000 chars
    title: title.substring(0, 80), // Limit: 80 chars
    callBackUrl: 'https://webhook.site/unique-uuid-here' // API requires this despite docs saying optional
  };
  
  Logger.info('🚨 ABOUT TO SEND TO SUNO API 🚨');
  Logger.debug('Full Suno API request body:', requestBody);
  Logger.info('Request keys present:', Object.keys(requestBody));
  Logger.info('callBackUrl value:', requestBody.callBackUrl);
  Logger.info('Request body length:', JSON.stringify(requestBody).length);
  
  Logger.info('🌐 Sending HTTP POST to Suno...');
  Logger.info('Endpoint: https://api.sunoapi.org/api/v1/generate');
  Logger.info('Authorization header present:', SUNO_API_KEY ? 'YES' : 'NO');
  
  const response = await fetch('https://api.sunoapi.org/api/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUNO_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  Logger.info('📥 Got HTTP response from Suno');
  Logger.info('Response status:', response.status);
  Logger.info('Response statusText:', response.statusText);
  Logger.info('Response headers:', [...response.headers.entries()]);
  
  if (!response.ok) {
    const error = await response.text();
    Logger.error(`🚨 Suno HTTP error: ${response.status}`, { 
      status: response.status,
      statusText: response.statusText,
      errorBody: error 
    });
    throw new Error(`Suno API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  Logger.info('📦 Parsed Suno response');
  Logger.debug('Full Suno API response:', data);
  Logger.info('Response code:', data?.code);
  Logger.info('Response msg:', data?.msg);
  Logger.info('Response data:', data?.data);
  
  // Official response format: { code: 200, msg: "success", data: { taskId: "..." } }
  if (!data || data.code !== 200) {
    Logger.error('Suno API returned error', { 
      fullResponse: data,
      code: data?.code,
      msg: data?.msg
    });
    throw new Error(`Suno API error: ${data?.msg || 'Unknown error'}`);
  }
  
  if (!data.data || !data.data.taskId) {
    Logger.error('Suno API missing taskId', { 
      fullResponse: data,
      hasData: !!data.data
    });
    throw new Error(`Suno API returned unexpected response structure`);
  }
  
  const taskId = data.data.taskId;
  
  Logger.success(`Suno task started: ${taskId}`);
  return taskId;
}

async function pollSunoStatus(taskId) {
  Logger.debug(`Checking Suno status for ${taskId}...`);
  
  const response = await fetch(
    `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`,
    {
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    Logger.error(`Suno status check HTTP error: ${response.status}`, { error });
    throw new Error(`Suno status check failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Official format: { code: 200, msg: "success", data: { taskId, status, response } }
  if (!data || data.code !== 200) {
    Logger.error('Suno status check returned error', { 
      fullResponse: data,
      code: data?.code,
      msg: data?.msg
    });
    throw new Error(`Suno status error: ${data?.msg || 'Unknown error'}`);
  }
  
  return data.data;
}

async function waitForSunoCompletion(taskId) {
  const maxAttempts = 48; // 4 minutes max (48 * 5s)
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const statusData = await pollSunoStatus(taskId);
    
    Logger.debug(`Poll attempt ${attempts + 1}/${maxAttempts}`, { 
      status: statusData.status,
      taskId: statusData.taskId
    });
    
    // Official format: status is "SUCCESS", "PROCESSING", "PENDING", or "FAILED"
    if (statusData.status === 'SUCCESS') {
      // Response structure: { response: { sunoData: [ { audioUrl, title, ... } ] } }
      if (!statusData.response || !statusData.response.sunoData || !statusData.response.sunoData[0]) {
        Logger.error('Suno SUCCESS but missing data', { statusData });
        throw new Error('Suno returned SUCCESS but no audio data found');
      }
      
      const song = statusData.response.sunoData[0];
      Logger.success(`Song ready: ${song.title}`, { audioUrl: song.audioUrl });
      return {
        audioUrl: song.audioUrl,
        imageUrl: song.imageUrl,
        title: song.title,
        lyrics: song.prompt
      };
    } else if (statusData.status === 'FAILED') {
      Logger.error('Suno generation failed', { statusData });
      throw new Error('Suno generation failed');
    }
    
    // Still PROCESSING or PENDING, wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    
    // Update badge to show progress
    updateBrowserActionTitle();
    updateBadge();
  }
  
  throw new Error('Suno generation timeout (4 minutes)');
}

// ============================================================================
// MAIN FLOW - Orchestrate Everything
// ============================================================================

async function generateSongFromArticle(articleText, songStyle, pageTitle) {
  Logger.info('═══════════════════════════════════════════════════════');
  Logger.info(`Starting song generation: ${songStyle}`, {
    pageTitle,
    textLength: articleText.length,
    articlePreview: articleText.substring(0, 200) + '...'
  });
  
  try {
    currentSong.title = pageTitle;
    currentSong.state = "generating_lyrics";
    startTimer();
    
    // Step 1: Generate lyrics with Claude
    const lyrics = await generateLyrics(articleText, songStyle);
    currentSong.lyrics = lyrics;
    
    // Step 2: Generate style tags with Claude
    const styleTags = await generateStyleTags(lyrics, songStyle);
    currentSong.style = styleTags;
    
    // Step 3: Send to Suno
    currentSong.state = "generating_music";
    updateBrowserActionTitle();
    const taskId = await generateMusic(lyrics, styleTags, pageTitle);
    currentSong.taskId = taskId;
    
    // Step 4: Poll for completion
    const result = await waitForSunoCompletion(taskId);
    
    // Success!
    currentSong.url = result.audioUrl;
    currentSong.state = "playing";
    stopTimer();
    updateBrowserActionTitle();
    
    Logger.success('SONG GENERATION COMPLETE!', {
      audioUrl: result.audioUrl,
      title: result.title,
      lyrics: currentSong.lyrics,
      style: currentSong.style
    });
    Logger.info('═══════════════════════════════════════════════════════');
    
    return result.audioUrl;
    
  } catch (error) {
    Logger.error('Song generation failed', {
      error: error.message,
      stack: error.stack,
      songStyle,
      pageTitle
    });
    stopTimer();
    currentSong.state = "idle";
    updateBrowserActionTitle();
    
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/songify.png'),
      title: '❌ Song Generation Failed',
      message: error.message
    });
    
    throw error;
  }
}

// ============================================================================
// UI AND STATE MANAGEMENT
// ============================================================================

function updateBrowserActionTitle() {
  let title = "Turn articles into songs!";
  
  if (currentSong.title) {
    const elapsedTime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    
    if (currentSong.state === "generating_lyrics") {
      title = `Generating lyrics for "${currentSong.title}"\nElapsed: ${formatTime(elapsedTime)}`;
    } else if (currentSong.state === "generating_music") {
      title = `Creating music for "${currentSong.title}"\nElapsed: ${formatTime(elapsedTime)} / ~${EXPECTED_DURATION}s`;
    } else if (currentSong.state === "playing") {
      title = `Now playing: "${currentSong.title}"\nStyle: ${currentSong.style}\n\nLyrics:\n${currentSong.lyrics}`;
    }
  }
  
  browser.browserAction.setTitle({ title });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startTimer() {
  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
  }
  startTime = Date.now();
  elapsedTimeInterval = setInterval(() => {
    updateBrowserActionTitle();
    updateBadge();
  }, 1000);
}

function stopTimer() {
  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
    elapsedTimeInterval = null;
    startTime = null;
    updateBrowserActionTitle();
    updateBadge();
  }
}

function updateBadge() {
  if (startTime) {
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    browser.browserAction.setBadgeText({ text: formatTime(elapsedTime) });
    browser.browserAction.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

// ============================================================================
// CONTENT SCRIPT COMMUNICATION
// ============================================================================

async function getCurrentTabContent() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  if (tabs.length > 0) {
    requestingTabId = tabs[0].id;
    return await browser.tabs.sendMessage(tabs[0].id, {action: "getText"});
  }
  return null;
}

async function forwardAudioUrlToContentScript(audioUrl) {
  if (!requestingTabId) {
    console.error('No requesting tab ID');
    return;
  }
  
  try {
    // Check if content script is ready
    const isReady = await browser.tabs.sendMessage(requestingTabId, {action: "ping"}).catch(() => false);
    
    if (isReady) {
      await browser.tabs.sendMessage(requestingTabId, {action: "playAudio", url: audioUrl});
      Logger.success('Audio URL sent to content script', { audioUrl });
      
      // Download after 4 minutes (let it stream first)
      setTimeout(() => {
        Logger.info('Downloading audio file...', { audioUrl });
        browser.downloads.download({
          url: audioUrl,
          filename: `${currentSong.title || 'song'}.mp3`
        });
      }, 4 * 60 * 1000);
      
      requestingTabId = null;
    } else {
      // Retry after a second
      Logger.warning('Content script not ready, retrying...');
      setTimeout(() => forwardAudioUrlToContentScript(audioUrl), 1000);
    }
  } catch (error) {
    Logger.error('Error sending message to content script', error);
  }
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

// Menu clicks
browser.menus.onClicked.addListener(async (info, tab) => {
  const content = await getCurrentTabContent();
  if (!content) {
    Logger.error('Failed to get page content from tab (menu click)');
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
  
  requestingTabId = tab.id;
  
  const audioUrl = await generateSongFromArticle(content.text, songStyle, tab.title);
  await forwardAudioUrlToContentScript(audioUrl);
});

// Browser action click (default to musical)
browser.browserAction.onClicked.addListener(async (tab) => {
  const content = await getCurrentTabContent();
  if (!content) {
    Logger.error('Failed to get page content from tab');
    return;
  }
  
  requestingTabId = tab.id;
  
  const audioUrl = await generateSongFromArticle(content.text, "musical", tab.title);
  await forwardAudioUrlToContentScript(audioUrl);
});

Logger.success('Background script ready! All systems initialized. [VERSION: 2024-11-23-03:28]');

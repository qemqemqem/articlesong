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

// API Keys (loaded from storage)
let ANTHROPIC_API_KEY = '';
let SUNO_API_KEY = '';

// Request tracking
const activeRequests = new Map(); // id -> { request, abortController, pollInterval }
let allRequests = []; // All requests (active + history)
let settings = {
  autoDownload: false,
  downloadOnly: false,
  downloadDirectory: 'ArticleSongs',
  maxHistoryItems: 20,
  autoPlayOnComplete: true,
  showNotifications: true,
  sunoModel: 'V6',
  claudeModel: '', // empty = auto-detect newest available model
  maxConcurrent: 1 // songs generated at once; the rest wait in the queue
};

let SUNO_POLL_MS = 5000; // let (not const) so tests can speed it up
const MAX_QUEUE_LENGTH = 25;
const EXPECTED_DURATION = 180; // seconds (3 min typical for V5)

const BACKGROUND_VERSION = '2024-11-23-18:30-CUSTOM-STYLES';
Logger.info('═══════════════════════════════════════════════════════');
Logger.info(`Article Song Background Script LOADED! [${BACKGROUND_VERSION}]`);
Logger.info('Custom Styles Feature: ENABLED');
Logger.info('═══════════════════════════════════════════════════════');

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
  recoverInterruptedRequests();
  Logger.info(`Loaded ${allRequests.length} requests from storage`);
}

// After a browser restart nothing is actually running: fail what was mid-flight, keep the queue.
function recoverInterruptedRequests() {
  allRequests.forEach(r => {
    if (RUNNING_STATUSES.includes(r.status)) {
      r.status = 'FAILED';
      r.error = 'Interrupted (the browser was restarted). Use Retry to start it again.';
    } else if (r.status === 'PLAYING') {
      r.status = 'COMPLETE';
    }
    r.playQueuePos = null; // nothing may autoplay after a restart
  });
}

// Persisting the whole list (article text included) is heavy and state changes come in bursts:
// write at most every 300ms; the popup is notified immediately.
let saveTimer = null;
function saveRequests() {
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      browser.storage.local.set({ requests: allRequests }).catch(error => Logger.error('Failed to save requests', error));
    }, 300);
  }
  broadcastUpdate();
}

async function saveSettings() {
  await browser.storage.local.set({ settings });
}

const initialized = Promise.all([loadAPIKeys(), loadRequests()]).then(() => {
  updateBadge();
  pumpQueue(); // resume songs that were queued before a restart
});

// Listen for storage changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.anthropic_api_key) {
      ANTHROPIC_API_KEY = changes.anthropic_api_key.newValue || '';
    }
    if (changes.suno_api_key) {
      SUNO_API_KEY = changes.suno_api_key.newValue || '';
    }
  }
  if (area === 'local' && changes.settings) {
    settings = { ...settings, ...changes.settings.newValue };
    pumpQueue(); // a higher concurrency limit may free slots
  }
});

// ============================================================================
// DUPLICATE-START GUARD
// ============================================================================

const RUNNING_STATUSES = ['RECEIVED', 'LYRICS', 'MUSIC']; // occupy a generation slot
const ACTIVE_STATUSES = ['QUEUED', ...RUNNING_STATUSES, 'PLAYING'];
const startsInFlight = new Set(); // keys claimed synchronously, before the request object exists

// Same page + same style + same highlighted text = same song
function songKey(tabUrl, songStyle, selectedText) {
  const styleId = typeof songStyle === 'object' ? songStyle.id : songStyle;
  return `${tabUrl}|${styleId}|${selectedText ? selectedText.slice(0, 120) : ''}`;
}

function isDuplicateStart(key) {
  return startsInFlight.has(key) ||
    allRequests.some(r => r.dedupeKey === key && ['QUEUED', ...RUNNING_STATUSES].includes(r.status));
}

const DUPLICATE_MESSAGE = 'This song is already being generated. Cancel it first if you want to start over.';

// ============================================================================
// ARTICLE TEXT (web page via content script, PDF via pdf.js)
// ============================================================================

const MIN_ARTICLE_CHARS = 200;

// A page that yields only a cookie banner or an empty shell would otherwise become a song about
// accepting cookies. Fail loudly instead.
function requireEnoughText(text, tabUrl) {
  const length = (text || '').trim().length;
  if (length < MIN_ARTICLE_CHARS) {
    throw new Error(`Could not find the article on this page (only ${length} characters of text). ` +
      'Highlight the text you want and use "highlighted text" instead.');
  }
  return text;
}

async function getArticleText(tabId, tabUrl) {
  if (PdfText.looksLikePdfUrl(tabUrl)) {
    Logger.info('PDF URL detected, extracting text with pdf.js', { tabUrl });
    return requireEnoughText(await PdfText.fromUrl(tabUrl, { force: true }), tabUrl);
  }
  try {
    await ensureContentScript(tabId); // tabs opened before an add-on update have none until reloaded
    const content = await browser.tabs.sendMessage(tabId, { action: "getText" });
    if (content && content.text) return requireEnoughText(content.text, tabUrl);
  } catch (error) {
    if (/Could not find the article/.test(error.message)) throw error;
    // Firefox's PDF viewer (and other privileged pages) have no content script
    Logger.warn('Content script unavailable, checking whether the tab is a PDF', error.message);
  }
  const pdfText = await PdfText.fromUrl(tabUrl);
  if (pdfText) return requireEnoughText(pdfText, tabUrl);
  throw new Error('Could not read this page. Try reloading it, or select text and use "selected text".');
}

// ============================================================================
// QUEUE
// ============================================================================

function startedAt(request) {
  return request.timestamps.started || request.timestamps.created;
}

function queuedRequests() {
  return allRequests.filter(r => r.status === 'QUEUED').sort((a, b) => a.queuePos - b.queuePos);
}

function nextQueuePos() {
  return allRequests.reduce((max, r) => (r.status === 'QUEUED' ? Math.max(max, r.queuePos) : max), -1) + 1;
}

function runningCount() {
  return allRequests.filter(r => RUNNING_STATUSES.includes(r.status)).length;
}

// Start queued songs (front of the queue first) while there are free generation slots.
// Idempotent and synchronous: the status flip happens before any await, so re-entrant calls
// (every updateRequest calls this) can never start the same song twice.
function pumpQueue() {
  const limit = Math.max(1, Number(settings.maxConcurrent) || 1);
  while (runningCount() < limit) {
    const next = queuedRequests()[0];
    if (!next) return;
    next.status = 'RECEIVED';
    next.timestamps.started = Date.now();
    Logger.info(`Dequeued ${next.id}, starting generation`);
    saveRequests();
    updateBadge();
    generateSongFromArticle(next).catch(() => {}); // failure is recorded on the request
  }
}

// What the popup needs to tell the user: started right away, or position N in the queue
function queueStatusFor(request) {
  const position = queuedRequests().findIndex(r => r.id === request.id) + 1;
  return { success: true, requestId: request.id, queued: position > 0, position };
}

// Apply a new order for the queue. Unknown / non-queued ids are ignored; queued songs
// missing from `orderedIds` keep their relative order after the listed ones.
function reorderQueue(orderedIds) {
  const queued = queuedRequests();
  const byId = new Map(queued.map(r => [r.id, r]));
  const listed = orderedIds.map(id => byId.get(id)).filter(Boolean);
  const rest = queued.filter(r => !listed.includes(r));
  [...listed, ...rest].forEach((r, i) => { r.queuePos = i; });
  saveRequests();
}

// ============================================================================
// REQUEST MANAGEMENT
// ============================================================================

function createRequest(articleText, articleUrl, articleTitle, songStyle, tabId, dedupeKey = null) {
  // Handle both string (legacy) and object (new) songStyle
  let styleObj = songStyle;
  if (typeof songStyle === 'string') {
    // Legacy string format - keep it as-is for backward compatibility
    styleObj = { id: songStyle, name: songStyle };
  }
  
  Logger.info(`Creating request with "${styleObj.name}" style`, {
    hasCustomDescription: !!styleObj.description,
    descriptionPreview: styleObj.description ? styleObj.description.substring(0, 80) + '...' : 'none'
  });
  
  const request = {
    id: generateRequestId(),
    articleTitle,
    articleUrl,
    articleText,
    songStyle: styleObj, // Store the full style object
    status: 'QUEUED',
    queuePos: nextQueuePos(),
    progress: {
      elapsed: 0,
      estimated: EXPECTED_DURATION
    },
    timestamps: {
      created: Date.now(),
      started: null,
      completed: null
    },
    audioUrl: null,
    lyrics: null,
    styleTags: null,
    lyricsProvider: null, // Track which service generated lyrics ('anthropic' or 'suno')
    error: null,
    sunoTaskId: null,
    tabId,
    dedupeKey: dedupeKey || songKey(articleUrl, styleObj, null)
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
      request.progress.elapsed = Math.floor((Date.now() - startedAt(request)) / 1000);
    }
    
    saveRequests();
    pumpQueue(); // a status change may have freed a generation slot
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
  const styleId = typeof request.songStyle === 'object' ? request.songStyle.id : request.songStyle;
  const styleName = typeof request.songStyle === 'object' ? request.songStyle.name : request.songStyle;
  
  Logger.info(`Generating ${styleName} lyrics with SunoAPI for ${request.id}...`);
  
  if (!SUNO_API_KEY) {
    openSettingsWithError('suno_missing');
    throw new Error('SunoAPI key not configured. Please set it in extension options.');
  }
  
  // Mark that we're using SunoAPI for lyrics
  updateRequest(request.id, { lyricsProvider: 'suno' });
  
  // Special case: "straight" means use article text directly
  if (styleId === "straight") {
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

// buildSunoLyricsPrompt() and getFallbackStyleTags() live in prompts.js (shared with the Android app)

// ============================================================================
// CLAUDE API - Generate Lyrics
// ============================================================================

async function generateLyrics(request, abortController) {
  Logger.info(`Generating ${request.songStyle.name} lyrics for ${request.id}...`);
  
  // Check if Anthropic key is available, otherwise use SunoAPI
  if (!ANTHROPIC_API_KEY) {
    Logger.info('No Anthropic key, falling back to SunoAPI lyrics generation');
    return await generateLyricsWithSuno(request, abortController);
  }
  
  // Mark that we're using Anthropic for lyrics
  updateRequest(request.id, { lyricsProvider: 'anthropic' });
  
  // Special case: "straight" means use article text directly
  if (request.songStyle.id === "straight") {
    return request.articleText;
  }
  
  const lyrics = await ClaudeClient.complete({
    apiKey: ANTHROPIC_API_KEY,
    system: LYRICS_SYSTEM_PROMPT,
    prompt: getLyricsPrompt(request.articleText, request.songStyle),
    maxTokens: 16000,
    thinkingBudget: 8192,
    signal: abortController.signal
  }).catch(handleClaudeError);
  
  Logger.success(`Lyrics generated for ${request.id} (${lyrics.length} chars)`);
  return lyrics;
}

async function generateStyleTags(lyrics, songStyle, abortController) {
  const styleName = typeof songStyle === 'object' ? songStyle.name : songStyle;
  
  Logger.info(`Generating style tags for ${styleName}...`);
  
  // If no Anthropic key, use simple fallback style tags
  if (!ANTHROPIC_API_KEY) {
    Logger.info('No Anthropic key, using fallback style tags');
    return getFallbackStyleTags(songStyle);
  }
  
  const tags = await ClaudeClient.complete({
    apiKey: ANTHROPIC_API_KEY,
    system: STYLE_SYSTEM_PROMPT,
    prompt: getStyleTagsPrompt(lyrics, songStyle),
    maxTokens: 8000,
    thinkingBudget: 4096,
    signal: abortController.signal
  }).catch(handleClaudeError);
  
  const trimmedTags = tags.substring(0, 120);
  
  Logger.success(`Style tags generated: "${trimmedTags}"`);
  return trimmedTags;
}

function handleClaudeError(error) {
  if (error.status === 401 || error.status === 403) {
    openSettingsWithError('anthropic_invalid');
  }
  throw error;
}

// ============================================================================
// SUNO CONTENT REJECTIONS
// ============================================================================
// Suno moderates lyrics (artist/producer names, sensitive words) and fails the task with a message like
// "Your lyrics contain producer tag X - we don't reference specific artists...". Those are fixable:
// rewrite the lyrics without the offending words and submit again.

const MAX_LYRIC_REWRITES = 2; // retries after the first attempt

class SunoRejectedError extends Error {
  constructor(reason) {
    super(`Suno generation failed: ${reason}`);
    this.name = 'SunoRejectedError';
    this.reason = reason;
    this.words = parseSunoRejection(reason);
  }
}

const SUNO_REJECTION_PATTERNS = /lyrics contain|producer tag|specific artist|sensitive|not allowed|prohibited|copyright|artist name/i;

function isSunoContentRejection(status, message) {
  return status === 'SENSITIVE_WORD_ERROR' || SUNO_REJECTION_PATTERNS.test(message || '');
}

// Pull the offending word(s) out of Suno's message; [] when it doesn't name any
function parseSunoRejection(message) {
  const words = new Set();
  const text = String(message || '');
  const add = w => { const clean = w.trim().toLowerCase(); if (clean.length >= 2) words.add(clean); };
  let m = text.match(/producer tag\s+["'\u201c\u2018]?([^\s"'\u201d\u2019,.;:()]+)/i);
  if (m) add(m[1]);
  const quoted = /(?:contains?|word|term|name|tag|artist)s?\s*[:\-]?\s*["'\u201c\u2018]([^"'\u201d\u2019]{2,40})["'\u201d\u2019]/gi;
  while ((m = quoted.exec(text)) !== null) add(m[1]);
  return [...words];
}

// Remove banned words, tolerating spacing/hyphen variants ("Ninety-Three", "ninety three")
function scrubWords(text, words) {
  let out = text || '';
  for (const word of words) {
    const letters = [...word].filter(ch => /\S/.test(ch)).map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (letters.length === 0) continue;
    out = out.replace(new RegExp(letters.join('[\\s\\-_.\']*'), 'gi'), '');
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?;:])/g, '$1').replace(/^[ \t]+|[ \t]+$/gm, '');
}

function buildRewritePrompt(lyrics, reason, banned) {
  const forbidden = banned.length
    ? `Forbidden words (do not use them in any spelling, spacing, hyphenation or form, and not inside other words): ${banned.join(', ')}`
    : 'No specific word was named, so avoid names of real artists, bands, producers, brands and anything else that could be flagged.';
  return `<task>
The lyrics below were rejected by the music generator.
Reason given: "${reason}"

${forbidden}

Rewrite the lyrics so they no longer contain the forbidden words or reference specific artists, bands, producers or brands. Keep the same story, structure, section tags and approximate length. Do not use the forbidden words anywhere. Output only the corrected lyrics.
</task>

<lyrics>
${lyrics}
</lyrics>`;
}

async function rewriteRejectedLyrics(request, banned, reason, abortController) {
  let lyrics = request.lyrics;
  if (request.songStyle.id !== 'straight' && ANTHROPIC_API_KEY) {
    lyrics = await ClaudeClient.complete({
      apiKey: ANTHROPIC_API_KEY,
      system: LYRICS_SYSTEM_PROMPT,
      prompt: buildRewritePrompt(request.lyrics, reason, banned),
      maxTokens: 16000,
      thinkingBudget: 4096,
      signal: abortController.signal
    }).catch(handleClaudeError);
  }
  return scrubWords(lyrics, banned); // guarantee, even if Claude repeats the word
}

const SUNO_ERROR_HINTS = {
  400: 'invalid parameters',
  405: 'rate limit exceeded',
  413: 'prompt too long',
  429: 'insufficient SunoAPI credits',
  430: 'calling too frequently, try again shortly',
  455: 'SunoAPI is under maintenance'
};

// Remaining SunoAPI credits for a key (the saved one by default). Free to call.
async function fetchSunoCredits(apiKey = SUNO_API_KEY) {
  if (!apiKey) throw new Error('No SunoAPI key saved yet');
  const response = await fetch('https://api.sunoapi.org/api/v1/generate/credit', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    throw new Error(`SunoAPI error: ${response.status} - ${await response.text()}`);
  }
  const data = await response.json();
  if (data?.code !== 200 || typeof data.data !== 'number') {
    throw new Error(`SunoAPI error ${data?.code}: ${SUNO_ERROR_HINTS[data?.code] || data?.msg || 'no credit balance returned'}`);
  }
  return data.data;
}

// ============================================================================
// SUNO API - Generate Music
// ============================================================================

async function generateMusic(request, abortController) {
  const model = settings.sunoModel || 'V6';
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
    if (isSunoContentRejection(null, data?.msg)) throw new SunoRejectedError(data.msg);
    throw new Error(`Suno API error ${data?.code}: ${SUNO_ERROR_HINTS[data?.code] || data?.msg || 'Unknown error'}`);
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

// Terminal failure statuses documented by SunoAPI (record-info)
const SUNO_FAILURE_STATUSES = [
  'FAILED', 'CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR'
];

// SunoAPI documents camelCase and snake_case variants across endpoints; accept both.
function normalizeSong(song) {
  return {
    audioUrl: song.audioUrl || song.audio_url || '',
    streamUrl: song.streamAudioUrl || song.stream_audio_url || '',
    imageUrl: song.imageUrl || song.image_url || '',
    title: song.title,
    prompt: song.prompt,
    duration: song.duration
  };
}

// Put a playable song into the request: either mark COMPLETE (download-only) or start playback.
function deliverSong(request, song, url, isStreaming) {
  const fields = {
    audioUrl: url,
    imageUrl: song.imageUrl,
    title: song.title,
    lyrics: song.prompt,
    duration: song.duration,
    isStreaming,
    progress: { elapsed: 0, estimated: 0 }
  };
  const somethingElsePlaying = allRequests.some(r => r.id !== request.id && r.status === 'PLAYING');
  if (settings.downloadOnly || somethingElsePlaying) {
    updateRequest(request.id, {
      ...fields,
      isStreaming: false,
      status: 'COMPLETE',
      // Another song is playing: wait in the play queue (download-only songs never play)
      playQueuePos: settings.downloadOnly ? null : nextPlayQueuePos(),
      timestamps: { ...request.timestamps, completed: Date.now() }
    });
    Logger.info(settings.downloadOnly ? 'Download-only mode: skipping playback' : 'Another song is playing; added to the play queue');
    return;
  }
  updateRequest(request.id, fields);
  playRequest(request, url, request.tabId); // sets PLAYING (or COMPLETE + playbackNote on failure)
}

async function waitForSunoCompletion(request, abortController) {
  const maxAttempts = 96; // 8 minutes max (96 * 5s)
  let attempts = 0;
  let delivered = false;
  
  return new Promise((resolve, reject) => {
    let polling = false; // never overlap polls if one takes longer than the interval
    const finish = (fn, value) => {
      clearInterval(pollInterval);
      fn(value);
    };
    
    const pollInterval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        if (abortController.signal.aborted) {
          finish(reject, new Error('Cancelled'));
          return;
        }
        
        const statusData = await pollSunoStatus(request.sunoTaskId, abortController);
        const status = statusData.status;
        const rawSong = statusData.response?.sunoData?.[0];
        const song = rawSong && normalizeSong(rawSong);
        const playUrl = song && (song.audioUrl || song.streamUrl);
        
        Logger.debug(`Poll attempt ${attempts + 1}/${maxAttempts}`, { status, hasSong: !!song });
        
        if (SUNO_FAILURE_STATUSES.includes(status)) {
          Logger.error('Suno generation failed', { statusData });
          const reason = statusData.errorMessage || status;
          finish(reject, isSunoContentRejection(status, reason) ? new SunoRejectedError(reason) : new Error(`Suno generation failed: ${reason}`));
          return;
        }
        
        // Start playback as soon as any playable URL (stream or final) exists
        if (!delivered && playUrl) {
          delivered = true;
          Logger.success('Audio ready, starting playback', { status, url: playUrl });
          deliverSong(request, song, playUrl, !(status === 'SUCCESS' && song.audioUrl));
          
          if (settings.showNotifications) {
            browser.notifications.create({
              type: 'basic',
              iconUrl: browser.runtime.getURL('icons/glitch_note-96.png'),
              title: 'Song Streaming!',
              message: `"${song.title || request.articleTitle}" is now playing`
            });
          }
          updateBadge();
        }
        
        if (status === 'SUCCESS') {
          if (!playUrl) {
            finish(reject, new Error('Suno returned SUCCESS but no audio data found'));
            return;
          }
          const finalUrl = song.audioUrl || playUrl;
          updateRequest(request.id, { isStreaming: false, audioUrl: finalUrl });
          Logger.success(`Song ready: ${song.title}`, { audioUrl: finalUrl });
          finish(resolve, {
            audioUrl: finalUrl,
            imageUrl: song.imageUrl,
            title: song.title,
            lyrics: song.prompt
          });
          return;
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          finish(reject, new Error('Suno generation timeout (8 minutes)'));
          return;
        }
        
        updateRequest(request.id, {
          progress: {
            elapsed: Math.floor((Date.now() - startedAt(request)) / 1000),
            estimated: EXPECTED_DURATION
          }
        });
        updateBadge();
        
      } catch (error) {
        finish(reject, error);
      } finally {
        polling = false;
      }
    }, SUNO_POLL_MS);
    
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

function throwIfCancelled(abortController) {
  if (abortController.signal.aborted) throw new Error('Cancelled');
}

async function generateSongFromArticle(request) {
  await initialized;
  const styleName = typeof request.songStyle === 'object' ? request.songStyle.name : request.songStyle;
  
  Logger.info('═══════════════════════════════════════════════════════');
  Logger.info(`Starting "${styleName}" song generation`, {
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
    throwIfCancelled(abortController);
    updateRequest(request.id, { lyrics });
    
    // Step 2: Generate style tags with Claude
    const styleTags = await generateStyleTags(lyrics, request.songStyle, abortController);
    throwIfCancelled(abortController);
    updateRequest(request.id, { styleTags });
    
    // Steps 3-4: send to Suno and wait. If Suno rejects the lyrics, rewrite them without the
    // offending words and submit again (a bounded number of times).
    const banned = [];
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        updateRequest(request.id, { status: 'MUSIC', statusNote: null });
        const taskId = await generateMusic(request, abortController);
        throwIfCancelled(abortController);
        updateRequest(request.id, { sunoTaskId: taskId });
        
        // Polls until Suno finishes; starts playback as soon as audio is available
        result = await waitForSunoCompletion(request, abortController);
        break;
      } catch (error) {
        if (!(error instanceof SunoRejectedError) || abortController.signal.aborted) throw error;
        error.words.forEach(w => { if (!banned.includes(w)) banned.push(w); });
        const canRewrite = request.songStyle.id !== 'straight' && ANTHROPIC_API_KEY ? true : banned.length > 0;
        if (attempt >= MAX_LYRIC_REWRITES || !canRewrite) {
          throw new Error(`Suno rejected the lyrics ${attempt + 1} time${attempt ? 's' : ''}; giving up. Last reason: ${error.reason}`);
        }
        Logger.warn(`Suno rejected the lyrics (attempt ${attempt + 1}); rewriting without: ${banned.join(', ') || '(unspecified)'}`, error.reason);
        const wordsNote = banned.length ? ` "${banned.join('", "')}"` : '';
        updateRequest(request.id, {
          status: 'LYRICS',
          statusNote: `Suno rejected${wordsNote || ' the lyrics'}. Rewriting (try ${attempt + 2} of ${MAX_LYRIC_REWRITES + 1})...`,
          rewrites: attempt + 1,
          rewriteNote: `Lyrics rewritten ${attempt + 1}x to satisfy Suno${wordsNote ? ` (removed${wordsNote})` : ''}`
        });
        const fixed = await rewriteRejectedLyrics(request, banned, error.reason, abortController);
        throwIfCancelled(abortController);
        updateRequest(request.id, { lyrics: fixed, styleTags: scrubWords(request.styleTags, banned) });
      }
    }
    
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
        iconUrl: browser.runtime.getURL('icons/glitch_note-96.png'),
        title: 'Song Ready!',
        message: `"${request.articleTitle}" is now playing`
      });
    }
    
    return result.audioUrl;
    
  } catch (error) {
    if (error.message === 'Cancelled' || abortController.signal.aborted) {
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
          iconUrl: browser.runtime.getURL('icons/glitch_note-96.png'),
          title: 'Song Generation Failed',
          message: error.message
        });
      }
    }
    
    updateBadge();
    return null; // failure/cancel is already recorded on the request
    
  } finally {
    activeRequests.delete(request.id);
    pumpQueue();
  }
}

// ============================================================================
// CONTENT SCRIPT COMMUNICATION
// ============================================================================

// A song plays in the tab's own <audio> element when a content script is available,
// otherwise (Firefox's PDF viewer, about: pages, strict-CSP pages, closed tabs) in the background page.
// request.playerKind records which one, so the controls know where to send commands.

let backgroundAudio = null; // { audio, requestId }

async function pingTab(tabId) {
  try {
    const reply = await browser.tabs.sendMessage(tabId, { action: 'ping' });
    return !!reply;
  } catch {
    return false;
  }
}

// Tabs opened before the add-on was installed/updated have no content script until reloaded: inject it.
async function ensureContentScript(tabId) {
  if (await pingTab(tabId)) return true;
  try {
    await browser.tabs.executeScript(tabId, { file: 'Readability.js' });
    await browser.tabs.executeScript(tabId, { file: 'article_extract.js' });
    await browser.tabs.executeScript(tabId, { file: 'content_script.js' });
  } catch (error) {
    Logger.warn('Could not inject content script', error.message);
    return false;
  }
  return pingTab(tabId);
}

function playInBackground(url, requestId) {
  stopBackgroundAudio();
  const audio = new Audio(url);
  audio.addEventListener('ended', () => markPlaybackEnded(requestId));
  backgroundAudio = { audio, requestId };
  return audio.play(); // rejects if the browser blocks autoplay or the media can't load
}

function stopBackgroundAudio() {
  if (!backgroundAudio) return;
  backgroundAudio.audio.pause();
  backgroundAudio = null;
}

// Mirrors the content script's message API so both players are driven the same way
function handleBackgroundPlayerMessage(message) {
  const player = backgroundAudio && backgroundAudio.requestId === message.requestId ? backgroundAudio.audio : null;
  switch (message.action) {
    case 'checkAudioStatus':
      if (!player) return { isPlaying: false };
      return {
        isPlaying: true, // an audio element exists
        isPaused: player.paused,
        isEnded: player.ended,
        currentTime: player.currentTime,
        duration: Number.isFinite(player.duration) ? player.duration : null
      };
    case 'togglePlayPause':
      if (!player) return { success: false, error: 'Audio element not found' };
      if (message.playing === true || (message.playing === undefined && player.paused)) {
        return player.play().then(() => ({ success: true, isPlaying: true }), error => ({ success: false, error: error.message }));
      }
      player.pause();
      return { success: true, isPlaying: false };
    case 'seekAudio': {
      if (!player) return { success: false, error: 'Audio element not found' };
      const target = message.time !== undefined ? message.time : player.currentTime + message.delta;
      const max = Number.isFinite(player.duration) ? player.duration : Infinity;
      player.currentTime = Math.max(0, Math.min(target, max));
      return { success: true, currentTime: player.currentTime };
    }
    case 'stopAudio':
      stopBackgroundAudio();
      return { status: 'Audio stopped' };
    default:
      return { success: false, error: `Unknown player action ${message.action}` };
  }
}

// Send a control message to wherever this request's audio lives
async function sendToPlayer(request, message) {
  if (request.playerKind === 'background') {
    return handleBackgroundPlayerMessage({ ...message, requestId: request.id });
  }
  if (!request.tabId) throw new Error('This song has no tab to play in');
  return browser.tabs.sendMessage(request.tabId, { ...message, requestId: request.id });
}

// Try the tab first, then the background page. Returns { ok, playerKind } or { ok: false, error }.
async function startPlayback(requestId, url, tabId) {
  const problems = [];
  if (tabId && await ensureContentScript(tabId)) {
    try {
      const reply = await browser.tabs.sendMessage(tabId, { action: 'playAudio', url, requestId });
      if (!reply || reply.success !== false) return { ok: true, playerKind: 'tab' };
      problems.push(`page: ${reply.error}`);
    } catch (error) {
      problems.push(`page: ${error.message}`);
    }
  } else {
    problems.push('page: no content script available in this tab');
  }
  
  Logger.warn('Falling back to background playback', problems);
  try {
    await playInBackground(url, requestId);
    return { ok: true, playerKind: 'background' };
  } catch (error) {
    problems.push(`background: ${error.message}`);
    return { ok: false, error: `Could not start playback (${problems.join('; ')})` };
  }
}

// Stop everything that is playing except `exceptId`; marks those songs COMPLETE
function stopOtherPlayback(exceptId) {
  allRequests.filter(r => r.status === 'PLAYING' && r.id !== exceptId).forEach(r => stopPlayback(r));
}

function stopPlayback(request) {
  updateRequest(request.id, {
    status: 'COMPLETE',
    timestamps: { ...request.timestamps, completed: Date.now() }
  });
  sendToPlayer(request, { action: 'stopAudio' }).catch(() => {}); // tab may be gone
  updateBadge();
}

function markPlaybackEnded(requestId) {
  const request = getRequest(requestId);
  if (request && request.status === 'PLAYING') {
    markComplete(request);
    advancePlayQueue(request); // a song that ended on its own hands over to the next one
  }
}

// ---- Play queue: finished songs waiting for the current song to end ----

function playQueue() {
  return allRequests.filter(r => r.status === 'COMPLETE' && r.playQueuePos != null)
    .sort((a, b) => a.playQueuePos - b.playQueuePos);
}

function nextPlayQueuePos() {
  return allRequests.reduce((max, r) => (r.playQueuePos != null ? Math.max(max, r.playQueuePos) : max), -1) + 1;
}

function reorderPlayQueue(orderedIds) {
  const queued = playQueue();
  const byId = new Map(queued.map(r => [r.id, r]));
  const listed = orderedIds.map(id => byId.get(id)).filter(Boolean);
  const rest = queued.filter(r => !listed.includes(r));
  [...listed, ...rest].forEach((r, i) => { r.playQueuePos = i; });
  saveRequests();
}

// Mark finished without telling the player to stop (it is about to be reused by the next song)
function markComplete(request) {
  updateRequest(request.id, {
    status: 'COMPLETE',
    timestamps: { ...request.timestamps, completed: Date.now() }
  });
  updateBadge();
}

// Start the first queued song, in the same place (tab / background page) the previous one played.
// If it can't start, playRequest leaves it COMPLETE with a note and the rest stay queued.
function advancePlayQueue(previous, tabId = previous && previous.tabId) {
  const next = playQueue()[0];
  if (!next) return null;
  updateRequest(next.id, { playQueuePos: null });
  Logger.info(`Play queue: starting "${next.articleTitle}"`);
  return playRequest(next, next.audioUrl, tabId);
}

// Begin playing a request's audio; on failure leave it COMPLETE with a note the popup can show.
async function playRequest(request, url, tabId) {
  updateRequest(request.id, { status: 'PLAYING', playbackNote: null });
  const result = await startPlayback(request.id, url, tabId);
  if (result.ok) {
    updateRequest(request.id, { playerKind: result.playerKind, tabId: tabId || request.tabId });
  } else {
    Logger.error('Playback failed', result.error);
    updateRequest(request.id, {
      status: 'COMPLETE',
      playbackNote: result.error,
      timestamps: { ...request.timestamps, completed: Date.now() }
    });
  }
  updateBadge();
  return result;
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateBadge() {
  const activeCount = allRequests.filter(r => ACTIVE_STATUSES.includes(r.status)).length;
  
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
    // articleText can be 100k characters per song and the popup never reads it
    sendResponse({ requests: allRequests.map(({ articleText, ...rest }) => rest), settings });
    return true;
  }
  
  if (message.action === 'createSong') {
    // Handle song creation from popup
    (async () => {
      try {
        Logger.info('Received createSong message from popup', {
          songStyle: message.songStyle,
          songStyleType: typeof message.songStyle,
          hasDescription: typeof message.songStyle === 'object' && !!message.songStyle?.description
        });
        
        await initialized;
        const selectedText = message.useSelection && message.selectedText ? message.selectedText : null;
        const key = songKey(message.tabUrl, message.songStyle, selectedText);
        if (queuedRequests().length >= MAX_QUEUE_LENGTH) {
          sendResponse({ success: false, error: `The queue is full (${MAX_QUEUE_LENGTH} songs). Cancel some or wait for them to finish.` });
          return;
        }
        if (isDuplicateStart(key)) {
          sendResponse({ success: false, duplicate: true, error: DUPLICATE_MESSAGE });
          return;
        }
        startsInFlight.add(key); // claim before any await so a second click can't slip through
        
        let request;
        try {
          let articleText;
          if (selectedText) {
            articleText = selectedText;
            Logger.info(`Using ${selectedText.split(/\s+/).length} words of selected text`);
          } else {
            articleText = await getArticleText(message.tabId, message.tabUrl);
          }
          
          request = createRequest(
            articleText, 
            message.tabUrl, 
            message.tabTitle, 
            message.songStyle, 
            message.tabId,
            key
          );
        } finally {
          startsInFlight.delete(key);
        }
        
        pumpQueue(); // starts it now if a slot is free, otherwise it waits in the queue
        sendResponse(queueStatusFor(request));
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
    // Flip the card immediately; don't wait for the in-flight network call to unwind
    const cancelling = getRequest(message.requestId);
    if (cancelling && ['QUEUED', ...RUNNING_STATUSES].includes(cancelling.status)) {
      updateRequest(cancelling.id, { status: 'CANCELLED', error: 'Cancelled by user' });
      updateBadge();
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
    if (!request || !request.audioUrl) {
      sendResponse({ success: false, error: 'This song has no audio to play' });
      return true;
    }
    (async () => {
      try {
        updateRequest(request.id, { playQueuePos: null }); // playing it now takes it out of the queue
        stopOtherPlayback(request.id);
        const tabs = await browser.tabs.query({active: true, currentWindow: true});
        const result = await playRequest(request, request.audioUrl, tabs[0] ? tabs[0].id : request.tabId);
        sendResponse(result.ok ? { success: true } : { success: false, error: result.error });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  if (message.action === 'retryRequest') {
    const request = getRequest(message.requestId);
    if (!request) {
      sendResponse({ success: false, error: 'Request no longer exists' });
      return true;
    }
    const key = request.dedupeKey || songKey(request.articleUrl, request.songStyle, null);
    if (isDuplicateStart(key)) {
      sendResponse({ success: false, duplicate: true, error: DUPLICATE_MESSAGE });
      return true;
    }
    if (queuedRequests().length >= MAX_QUEUE_LENGTH) {
      sendResponse({ success: false, error: `The queue is full (${MAX_QUEUE_LENGTH} songs).` });
      return true;
    }
    startsInFlight.add(key);
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      const newRequest = createRequest(
        request.articleText,
        request.articleUrl,
        request.articleTitle,
        request.songStyle,
        tabs[0] ? tabs[0].id : request.tabId,
        key
      );
      pumpQueue();
      sendResponse(queueStatusFor(newRequest));
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    }).finally(() => startsInFlight.delete(key));
    return true;
  }
  
  if (message.action === 'reorderPlayQueue') {
    reorderPlayQueue(Array.isArray(message.orderedIds) ? message.orderedIds : []);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'removeFromPlayQueue') {
    const request = getRequest(message.requestId);
    if (request && request.playQueuePos != null) updateRequest(request.id, { playQueuePos: null });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'clearPlayQueue') {
    playQueue().forEach(r => updateRequest(r.id, { playQueuePos: null }));
    sendResponse({ success: true });
    return true;
  }
  
  // Skip to the next song in the play queue (or just stop if it is empty)
  if (message.action === 'playNext') {
    (async () => {
      try {
        const current = allRequests.find(r => r.status === 'PLAYING');
        if (playQueue().length === 0) {
          if (current) stopPlayback(current);
          sendResponse({ success: true, started: false });
          return;
        }
        let tabId = current && current.tabId;
        if (current) markComplete(current); // the next song reuses the same player
        else tabId = (await browser.tabs.query({active: true, currentWindow: true}))[0]?.id;
        const result = await advancePlayQueue(current, tabId);
        sendResponse(result && !result.ok ? { success: false, error: result.error } : { success: true, started: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  if (message.action === 'reorderQueue') {
    reorderQueue(Array.isArray(message.orderedIds) ? message.orderedIds : []);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'clearQueue') {
    queuedRequests().forEach(r => updateRequest(r.id, { status: 'CANCELLED', error: 'Removed from queue' }));
    updateBadge();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'removeRequest') {
    const request = getRequest(message.requestId);
    if (request && !ACTIVE_STATUSES.includes(request.status)) {
      allRequests = allRequests.filter(r => r.id !== message.requestId);
      saveRequests();
    }
    sendResponse({ success: !!request && !ACTIVE_STATUSES.includes(request.status) });
    return true;
  }
  
  if (message.action === 'clearHistory') {
    allRequests = allRequests.filter(r => ACTIVE_STATUSES.includes(r.status));
    saveRequests();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'audioEnded') {
    markPlaybackEnded(message.requestId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'stopPlaying') {
    const request = getRequest(message.requestId);
    if (request && request.status === 'PLAYING') stopPlayback(request);
    sendResponse({ success: true });
    return true;
  }
  
  // Credit balance for the popup, and key checks for the settings page
  if (message.action === 'getSunoCredits' || message.action === 'testSunoKey') {
    const key = message.action === 'testSunoKey' ? (message.key || '').trim() : SUNO_API_KEY;
    fetchSunoCredits(key)
      .then(credits => sendResponse({ success: true, credits }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'testAnthropicKey') {
    ClaudeClient.fetchBestModel((message.key || '').trim())
      .then(model => sendResponse({ success: true, model }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // togglePlayPause / seekAudio / validatePlaying are relayed to the request's player
  const PLAYER_RELAYS = { togglePlayPause: 'togglePlayPause', seekAudio: 'seekAudio', validatePlaying: 'checkAudioStatus' };
  if (PLAYER_RELAYS[message.action]) {
    const request = getRequest(message.requestId);
    if (!request || request.status !== 'PLAYING') {
      sendResponse(message.action === 'validatePlaying'
        ? { isPlaying: false, error: 'Request not in playing state' }
        : { success: false, error: 'Request not playing' });
      return true;
    }
    sendToPlayer(request, {
      action: PLAYER_RELAYS[message.action],
      time: message.time,
      delta: message.delta,
      playing: message.playing
    }).then(sendResponse).catch((error) => {
      Logger.error(`${message.action} failed`, error);
      // validatePlaying: the tab was closed or navigated away, so the audio is gone
      sendResponse(message.action === 'validatePlaying'
        ? { isPlaying: false, error: error.message }
        : { success: false, error: error.message });
    });
    return true; // keep the channel open
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
  title: "As Written (sing the text, no new lyrics)",
  contexts: ["browser_action"]
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================

browser.menus.onClicked.addListener(async (info, tab) => {
  try {
    const articleText = await getArticleText(tab.id, tab.url);
    
    // Context menu still uses legacy string IDs
    // These will be converted to style objects in createRequest()
    let songStyleId;
    switch (info.menuItemId) {
      case "spoken-word-song": songStyleId = "spoken"; break;
      case "musical-song": songStyleId = "musical"; break;
      case "meme-song": songStyleId = "meme"; break;
      case "cute-song": songStyleId = "cute"; break;
      case "informative-song": songStyleId = "informative"; break;
      case "straight-lyrics": songStyleId = "straight"; break;
      default: songStyleId = "musical";
    }
    
    const key = songKey(tab.url, songStyleId, null);
    if (isDuplicateStart(key)) {
      Logger.warn('Ignoring duplicate menu request', key);
      return;
    }
    createRequest(articleText, tab.url, tab.title, songStyleId, tab.id, key);
    pumpQueue();
    
  } catch (error) {
    Logger.error('Menu click handler error', error);
  }
});

Logger.success('Background script ready! All systems initialized. [VERSION: 2024-11-23-05:07]');

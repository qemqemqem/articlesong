// Popup UI for Article Song
// Displays active requests and history

let requests = [];
let settings = {};
let customStyles = []; // Loaded custom song styles
let selectionInfo = { hasSelection: false, selectedText: '', wordCount: 0 };
let useSelection = false; // Whether to use selected text for next song creation

// Status display configuration
const STATUS_CONFIG = {
  RECEIVED: { icon: '>', text: 'Request received', color: '#667eea' },
  LYRICS_ANTHROPIC: { icon: '>', text: 'Generating lyrics with Claude...', color: '#667eea' },
  LYRICS_SUNO: { icon: '>', text: 'Generating lyrics with SunoAPI...', color: '#667eea' },
  LYRICS: { icon: '>', text: 'Generating lyrics...', color: '#667eea' }, // Fallback
  MUSIC: { icon: '>', text: 'Creating music with SunoAPI...', color: '#667eea' },
  PLAYING: { icon: '>', text: 'Playing now', color: '#48bb78' },
  STREAMING: { icon: '~', text: 'Streaming (generating full quality...)', color: '#ed8936' },
  COMPLETE: { icon: '+', text: 'Complete', color: '#48bb78' },
  FAILED: { icon: 'x', text: 'Failed', color: '#f56565' },
  CANCELLED: { icon: '-', text: 'Cancelled', color: '#718096' }
};

// Initialize popup
async function init() {
  await loadData();
  await loadStyles(); // Load custom styles
  await checkSelection(); // Check for highlighted text
  renderUI();
  renderStyleButtons(); // Render dynamic style buttons
  await updateNowPlaying(); // Initial check
  setupEventListeners();
  setupMessageListener();
  setupStorageListener(); // Listen for style changes
}

// Load custom styles
async function loadStyles() {
  try {
    // Load the prompts.js functions
    if (typeof loadCustomStyles !== 'undefined') {
      customStyles = await loadCustomStyles();
    } else {
      console.error('prompts.js not loaded, using hardcoded styles');
      customStyles = [
        { id: "spoken", name: "Spoken Word" },
        { id: "musical", name: "Musical" },
        { id: "meme", name: "Meme" },
        { id: "cute", name: "Cute" },
        { id: "informative", name: "Informative" },
        { id: "pop", name: "Pop" }
      ];
    }
  } catch (error) {
    console.error('Error loading styles:', error);
    // Fallback to defaults
    customStyles = [
      { id: "spoken", name: "Spoken Word" },
      { id: "musical", name: "Musical" },
      { id: "meme", name: "Meme" },
      { id: "cute", name: "Cute" },
      { id: "informative", name: "Informative" },
      { id: "pop", name: "Pop" }
    ];
  }
}

// Render style buttons dynamically
function renderStyleButtons() {
  const container = document.getElementById('style-buttons');
  if (!container) return;
  
  container.innerHTML = '';
  
  customStyles.forEach(style => {
    const button = document.createElement('button');
    button.className = 'btn btn-primary create-song-btn';
    button.dataset.styleId = style.id; // Store ID for reference
    button.textContent = style.name;
    
    // Add click handler with full style object
    button.addEventListener('click', async () => {
      await createSong(style); // Pass the full style object!
    });
    
    container.appendChild(button);
  });
}

// Load data from background
async function loadData() {
  const response = await browser.runtime.sendMessage({ action: 'getRequests' });
  if (response) {
    requests = response.requests || [];
    settings = response.settings || {};
  }
}

// Check for selected text in active tab
async function checkSelection() {
  try {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs && tabs.length > 0) {
      const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'getSelection' });
      if (response && response.hasSelection) {
        selectionInfo = response;
        useSelection = true; // Auto-enable if text is selected
      }
    }
  } catch (error) {
    console.log('Could not check selection (content script may not be loaded):', error);
  }
}

// Render the entire UI
function renderUI() {
  const activeRequests = requests.filter(r => isActive(r.status));
  const historyRequests = requests.filter(r => !isActive(r.status)).slice(0, 20);
  
  // Update counts
  document.getElementById('active-count').textContent = activeRequests.length;
  document.getElementById('history-count').textContent = historyRequests.length;
  
  // Show/hide sections
  const activeSection = document.getElementById('active-section');
  const historySection = document.getElementById('history-section');
  const emptyState = document.getElementById('empty-state');
  
  if (requests.length === 0) {
    activeSection.style.display = 'none';
    historySection.style.display = 'none';
    emptyState.style.display = 'block';
    hideNowPlaying();
    return;
  }
  
  emptyState.style.display = 'none';
  activeSection.style.display = activeRequests.length > 0 ? 'block' : 'none';
  historySection.style.display = historyRequests.length > 0 ? 'block' : 'none';
  
  // Render active requests
  renderRequestList(activeRequests, 'active-requests', true);
  
  // Render history
  renderRequestList(historyRequests, 'history-requests', false);
  
  // Update selection info UI
  updateSelectionUI();
}

// Update selection info UI
function updateSelectionUI() {
  const selectionInfoEl = document.getElementById('selection-info');
  const wordCountEl = document.getElementById('selection-word-count');
  const checkbox = document.getElementById('use-selection-checkbox');
  
  if (selectionInfo.hasSelection) {
    selectionInfoEl.style.display = 'block';
    wordCountEl.textContent = selectionInfo.wordCount;
    checkbox.checked = useSelection;
  } else {
    selectionInfoEl.style.display = 'none';
  }
}

// Render a list of requests
function renderRequestList(requestList, containerId, isActive) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  
  requestList.forEach(request => {
    const card = createRequestCard(request, isActive);
    container.appendChild(card);
  });
}

// Create a request card element
function createRequestCard(request, isActive) {
  const card = document.createElement('div');
  card.className = `request-card ${getCardClass(request.status, request.isStreaming)}`;
  card.dataset.requestId = request.id;
  
  // Determine effective status (PLAYING can be streaming or complete)
  let effectiveStatus = request.status;
  if (request.status === 'PLAYING' && request.isStreaming) {
    effectiveStatus = 'STREAMING';
  }
  
  // For LYRICS status, check which provider is being used
  if (request.status === 'LYRICS') {
    if (request.lyricsProvider === 'anthropic') {
      effectiveStatus = 'LYRICS_ANTHROPIC';
    } else if (request.lyricsProvider === 'suno') {
      effectiveStatus = 'LYRICS_SUNO';
    }
  }
  
  const config = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.RECEIVED;
  
  // Title
  const title = document.createElement('div');
  title.className = 'request-title';
  title.innerHTML = `
    <span>${truncate(request.articleTitle, 40)}</span>
  `;
  card.appendChild(title);
  
  // Status
  const status = document.createElement('div');
  status.className = 'request-status';
  
  if (isActive && (request.status === 'LYRICS' || request.status === 'MUSIC')) {
    status.innerHTML = `
      <span class="spinner"></span>
      <span>${config.text}</span>
    `;
  } else if (effectiveStatus === 'STREAMING') {
    // Show spinner for streaming too
    status.innerHTML = `
      <span class="spinner"></span>
      <span>${config.text}</span>
    `;
  } else {
    status.innerHTML = `
      <span class="status-icon">${config.icon}</span>
      <span>${config.text}</span>
    `;
  }
  card.appendChild(status);
  
  // Progress bar for active requests
  if (isActive && request.progress) {
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    
    let percent = 0;
    if (request.status === 'LYRICS') {
      percent = 20;
    } else if (request.status === 'MUSIC') {
      const elapsed = request.progress.elapsed || 0;
      const estimated = request.progress.estimated || 60;
      percent = 20 + (Math.min(elapsed / estimated, 1) * 60);
    } else if (request.status === 'PLAYING') {
      // Streaming vs complete
      if (request.isStreaming) {
        percent = 75; // Streaming ready (not fully complete)
        progressFill.style.backgroundColor = '#ed8936'; // Orange for streaming
      } else {
        percent = 100; // Full quality ready
        progressFill.style.backgroundColor = '#48bb78'; // Green for complete
      }
    }
    
    progressFill.style.width = `${percent}%`;
    progressBar.appendChild(progressFill);
    card.appendChild(progressBar);
  }
  
  // Meta info
  const meta = document.createElement('div');
  meta.className = 'request-meta';
  
  const metaParts = [];
  
  // Style tag
  if (request.songStyle) {
    const styleName = typeof request.songStyle === 'object' ? request.songStyle.name : request.songStyle;
    metaParts.push(`<span class="style-tag">${styleName}</span>`);
  }
  
  // Time info
  if (isActive && request.progress && request.progress.elapsed) {
    metaParts.push(`${formatTime(request.progress.elapsed)} / ~${formatTime(request.progress.estimated || 60)}`);
  } else if (request.timestamps.completed) {
    metaParts.push(formatRelativeTime(request.timestamps.completed));
  }
  
  meta.innerHTML = metaParts.join(' - ');
  card.appendChild(meta);
  
  // Error message
  if (request.status === 'FAILED' && request.error) {
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = request.error;
    card.appendChild(error);
  }
  
  // Copy buttons for lyrics and style (if available)
  if (request.lyrics || request.styleTags) {
    const copySection = document.createElement('div');
    copySection.className = 'copy-section';
    copySection.style.cssText = 'display: flex; gap: 6px; margin-bottom: 8px;';
    
    if (request.lyrics) {
      const copyLyricsBtn = createButton('Copy Lyrics', 'btn-secondary', () => copyToClipboard(request.lyrics, 'Lyrics', copyLyricsBtn));
      copyLyricsBtn.style.flex = '1';
      copyLyricsBtn.style.fontSize = '11px';
      copySection.appendChild(copyLyricsBtn);
    }
    
    if (request.styleTags) {
      const copyStyleBtn = createButton('Copy Style', 'btn-secondary', () => copyToClipboard(request.styleTags, 'Style', copyStyleBtn));
      copyStyleBtn.style.flex = '1';
      copyStyleBtn.style.fontSize = '11px';
      copySection.appendChild(copyStyleBtn);
    }
    
    card.appendChild(copySection);
  }
  
  // Actions
  const actions = document.createElement('div');
  actions.className = 'request-actions';
  
  if (isActive && (request.status === 'LYRICS' || request.status === 'MUSIC')) {
    // Cancel button
    const cancelBtn = createButton('Cancel', 'btn-danger', () => cancelRequest(request.id));
    actions.appendChild(cancelBtn);
  } else if (request.status === 'PLAYING') {
    // Playing controls - show different UI for streaming vs complete
    const playingNote = document.createElement('div');
    playingNote.style.cssText = 'font-size: 12px; margin-bottom: 8px; font-weight: 500;';
    
      if (request.isStreaming) {
        playingNote.style.color = '#ed8936';
        playingNote.innerHTML = '~ Streaming now - Full quality generating...';
      } else {
        playingNote.style.color = '#48bb78';
        playingNote.innerHTML = '+ Playing in page with audio controls';
      }
    
    card.appendChild(playingNote);
    
    // Download button - show different text if streaming
    const downloadBtnText = request.isStreaming ? 'Download (when ready)' : 'Download';
    const downloadBtn = createButton(downloadBtnText, request.isStreaming ? 'btn-secondary' : 'btn-primary', () => downloadRequest(request.id));
    if (request.isStreaming && !request.audioDownloadUrl) {
      downloadBtn.disabled = true;
      downloadBtn.style.opacity = '0.5';
      downloadBtn.title = 'Download will be available when full quality generation completes';
    }
    actions.appendChild(downloadBtn);
    
    // Stop button
    const stopBtn = createButton('Stop & Mark Complete', 'btn-secondary', () => stopPlaying(request.id));
    actions.appendChild(stopBtn);
  } else if (request.status === 'COMPLETE') {
    // Download button
    const downloadBtn = createButton('Download', 'btn-primary', () => downloadRequest(request.id));
    actions.appendChild(downloadBtn);
    
    // Play again button
    const playBtn = createButton('Play Again', 'btn-secondary', () => playAgain(request.id));
    actions.appendChild(playBtn);
  } else if (request.status === 'FAILED') {
    // Retry button
    const retryBtn = createButton('Retry', 'btn-success', () => retryRequest(request.id));
    actions.appendChild(retryBtn);
  }
  
  card.appendChild(actions);
  
  return card;
}

// Helper functions
function isActive(status) {
  return ['RECEIVED', 'LYRICS', 'MUSIC', 'PLAYING'].includes(status);
}

function getCardClass(status, isStreaming) {
  if (status === 'PLAYING' && isStreaming) return 'streaming';
  if (isActive(status)) return 'active';
  if (status === 'COMPLETE') return 'complete';
  if (status === 'FAILED') return 'failed';
  if (status === 'CANCELLED') return 'cancelled';
  return '';
}

function createButton(text, className, onClick) {
  const btn = document.createElement('button');
  btn.className = `btn ${className}`;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// Action handlers
async function cancelRequest(requestId) {
  await browser.runtime.sendMessage({ 
    action: 'cancelRequest', 
    requestId 
  });
  await loadData();
  renderUI();
}

async function downloadRequest(requestId) {
  await browser.runtime.sendMessage({ 
    action: 'downloadRequest', 
    requestId 
  });
}

async function playAgain(requestId) {
  await browser.runtime.sendMessage({ 
    action: 'playAgain', 
    requestId 
  });
}

async function retryRequest(requestId) {
  await browser.runtime.sendMessage({ 
    action: 'retryRequest', 
    requestId 
  });
  await loadData();
  renderUI();
}

async function stopPlaying(requestId) {
  await browser.runtime.sendMessage({ 
    action: 'stopPlaying', 
    requestId 
  });
  await loadData();
  renderUI();
}

async function copyToClipboard(text, label, button) {
  try {
    await navigator.clipboard.writeText(text);
    
    // Visual feedback on button
    if (button) {
      const originalText = button.textContent;
      const originalBg = button.style.backgroundColor;
      const originalColor = button.style.color;
      
      button.textContent = 'Copied!';
      button.style.backgroundColor = '#48bb78';
      button.style.color = 'white';
      button.disabled = true;
      
      setTimeout(() => {
        button.textContent = originalText;
        button.style.backgroundColor = originalBg;
        button.style.color = originalColor;
        button.disabled = false;
      }, 1500);
    }
    
    // Also show in footer
    const statusEl = document.getElementById('footer-status');
    if (statusEl) {
      statusEl.textContent = `${label} copied!`;
      statusEl.style.color = '#48bb78';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    alert(`Failed to copy ${label.toLowerCase()}: ${error.message}`);
  }
}

// Now Playing Controls
let currentPlayingRequest = null;
let isPlaying = true; // Assume playing by default when song starts

async function updateNowPlaying() {
  // Find the first request in PLAYING status
  const playingRequest = requests.find(r => r.status === 'PLAYING');
  
  if (playingRequest) {
    // Validate that audio is actually playing in the page
    try {
      const validation = await browser.runtime.sendMessage({
        action: 'validatePlaying',
        requestId: playingRequest.id
      });
      
      if (!validation || !validation.isPlaying) {
        // Audio is not actually playing - mark as complete
        console.log('Audio not playing, marking as complete');
        await browser.runtime.sendMessage({
          action: 'stopPlaying',
          requestId: playingRequest.id
        });
        await loadData();
        hideNowPlaying();
        return;
      }
      
      // Update play/pause state from validation
      isPlaying = !validation.isPaused;
    } catch (error) {
      console.error('Failed to validate playing status:', error);
    }
    
    // If we have a different playing request, or first time showing
    if (!currentPlayingRequest || currentPlayingRequest.id !== playingRequest.id) {
      currentPlayingRequest = playingRequest;
    }
    showNowPlaying(playingRequest);
  } else {
    // No playing request found - hide the bar
    if (currentPlayingRequest) {
      currentPlayingRequest = null;
      hideNowPlaying();
    }
  }
}

function showNowPlaying(request) {
  const nowPlaying = document.getElementById('now-playing');
  const titleEl = document.getElementById('now-playing-title');
  const subtitleEl = document.getElementById('now-playing-subtitle');
  const iconEl = document.querySelector('.now-playing-icon');
  
  // Update text
  if (request.isStreaming) {
    titleEl.textContent = 'Streaming';
    iconEl.textContent = '~';
  } else {
    titleEl.textContent = 'Now Playing';
    iconEl.textContent = '~';
  }
  subtitleEl.textContent = request.articleTitle;
  
  // Show the bar
  nowPlaying.style.display = 'flex';
  
  // Update play/pause button state
  updatePlayPauseButton();
}

function hideNowPlaying() {
  const nowPlaying = document.getElementById('now-playing');
  nowPlaying.style.display = 'none';
  currentPlayingRequest = null;
}

function updatePlayPauseButton() {
  const icon = document.getElementById('play-pause-icon');
  icon.textContent = isPlaying ? '||' : '>';
}

async function togglePlayPause() {
  if (!currentPlayingRequest) {
    console.error('No current playing request');
    return;
  }
  
  console.log('Toggling playback for request:', currentPlayingRequest.id);
  
  try {
    // Send message to content script to toggle playback
    const response = await browser.runtime.sendMessage({
      action: 'togglePlayPause',
      requestId: currentPlayingRequest.id
    });
    
    console.log('Toggle playback response:', response);
    
    if (response && response.success && response.isPlaying !== undefined) {
      isPlaying = response.isPlaying;
      updatePlayPauseButton();
    } else if (response && !response.success) {
      console.error('Toggle playback failed:', response.error);
    }
  } catch (error) {
    console.error('Failed to toggle playback:', error);
  }
}

async function clearHistory() {
  if (confirm('Clear all completed and failed requests from history?')) {
    await browser.runtime.sendMessage({ action: 'clearHistory' });
    await loadData();
    renderUI();
  }
}

async function createSong(style) {
  try {
    // Get current tab
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      alert('No active tab found');
      return;
    }
    
    const tab = tabs[0];
    
    // Determine if we should use selected text
    const shouldUseSelection = useSelection && selectionInfo.hasSelection;
    
    // Request song creation from background script
    const response = await browser.runtime.sendMessage({ 
      action: 'createSong',
      songStyle: style,
      tabId: tab.id,
      tabTitle: tab.title,
      tabUrl: tab.url,
      useSelection: shouldUseSelection,
      selectedText: shouldUseSelection ? selectionInfo.selectedText : null
    });
    
    // Check if request was successful
    if (response && !response.success && response.error) {
      // If it's an API key error, settings page will open automatically
      // Just show a brief message in popup
      if (response.error.includes('not configured')) {
        // Settings page will open, don't show alert
        return;
      }
      throw new Error(response.error);
    }
    
    // Refresh UI to show new request
    await loadData();
    renderUI();
    
  } catch (error) {
    console.error('Failed to create song:', error);
    // Only show alert for non-API-key errors
    if (!error.message.includes('not configured')) {
      alert('Failed to create song: ' + error.message);
    }
  }
}

async function createCustomStyleSong() {
  const input = document.getElementById('custom-style-input');
  const customStyle = input.value.trim();
  
  if (!customStyle) {
    alert('Please enter style guidance');
    input.focus();
    return;
  }
  
  // Create song with custom style
  await createSong(customStyle);
  
  // Clear input after successful creation
  input.value = '';
}

// Event listeners
function setupEventListeners() {
  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  
  // Clear history button
  document.getElementById('clear-history-btn').addEventListener('click', (e) => {
    e.preventDefault();
    clearHistory();
  });
  
  // Create song buttons - now handled in renderStyleButtons()
  // The "straight lyrics" button still needs handling if it exists
  const straightBtn = document.querySelector('[data-style="straight"]');
  if (straightBtn) {
    straightBtn.addEventListener('click', async () => {
      await createSong({ id: "straight", name: "Straight", description: "" });
    });
  }
  
  // Custom style button
  document.getElementById('custom-style-btn').addEventListener('click', async () => {
    await createCustomStyleSong();
  });
  
  // Custom style input - Enter key
  document.getElementById('custom-style-input').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      await createCustomStyleSong();
    }
  });
  
  // Play/pause button
  document.getElementById('play-pause-btn').addEventListener('click', async () => {
    await togglePlayPause();
  });
  
  // Use selection checkbox
  document.getElementById('use-selection-checkbox').addEventListener('change', (e) => {
    useSelection = e.target.checked;
  });
}

// Listen for updates from background
function setupMessageListener() {
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'requestsUpdated') {
      loadData().then(() => {
        renderUI();
        // Update now playing specifically when requests change
        updateNowPlaying();
      });
    }
    if (message.action === 'stylesUpdated') {
      // Styles were updated in the editor, reload them
      loadStyles().then(renderStyleButtons);
    }
  });
}

// Setup storage listener for style changes
function setupStorageListener() {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.customStyles) {
      // Styles changed, reload them
      loadStyles().then(renderStyleButtons);
    }
  });
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', init);

// Refresh UI every second to update timers
setInterval(() => {
  if (requests.some(r => isActive(r.status))) {
    renderUI();
  }
}, 1000);

// Check now playing status every 3 seconds to validate audio is actually playing
setInterval(() => {
  updateNowPlaying();
}, 3000);


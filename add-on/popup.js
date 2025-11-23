// Popup UI for Article Song
// Displays active requests and history

let requests = [];
let settings = {};

// Status display configuration
const STATUS_CONFIG = {
  RECEIVED: { icon: '>', text: 'Request received', color: '#667eea' },
  LYRICS: { icon: '>', text: 'Generating lyrics with Anthropic...', color: '#667eea' },
  MUSIC: { icon: '>', text: 'Creating music with SunoAPI...', color: '#667eea' },
  PLAYING: { icon: '>', text: 'Playing now', color: '#48bb78' },
  COMPLETE: { icon: '+', text: 'Complete', color: '#48bb78' },
  FAILED: { icon: 'x', text: 'Failed', color: '#f56565' },
  CANCELLED: { icon: '-', text: 'Cancelled', color: '#718096' }
};

// Initialize popup
async function init() {
  await loadData();
  renderUI();
  setupEventListeners();
  setupMessageListener();
}

// Load data from background
async function loadData() {
  const response = await browser.runtime.sendMessage({ action: 'getRequests' });
  if (response) {
    requests = response.requests || [];
    settings = response.settings || {};
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
    return;
  }
  
  emptyState.style.display = 'none';
  activeSection.style.display = activeRequests.length > 0 ? 'block' : 'none';
  historySection.style.display = historyRequests.length > 0 ? 'block' : 'none';
  
  // Render active requests
  renderRequestList(activeRequests, 'active-requests', true);
  
  // Render history
  renderRequestList(historyRequests, 'history-requests', false);
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
  card.className = `request-card ${getCardClass(request.status)}`;
  card.dataset.requestId = request.id;
  
  const config = STATUS_CONFIG[request.status] || STATUS_CONFIG.RECEIVED;
  
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
      percent = 90;
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
    metaParts.push(`<span class="style-tag">${request.songStyle}</span>`);
  }
  
  // Time info
  if (isActive && request.progress && request.progress.elapsed) {
    metaParts.push(`${formatTime(request.progress.elapsed)} / ~${formatTime(request.progress.estimated || 60)}`);
  } else if (request.timestamps.completed) {
    metaParts.push(formatRelativeTime(request.timestamps.completed));
  }
  
  meta.innerHTML = metaParts.join(' • ');
  card.appendChild(meta);
  
  // Error message
  if (request.status === 'FAILED' && request.error) {
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = request.error;
    card.appendChild(error);
  }
  
  // Actions
  const actions = document.createElement('div');
  actions.className = 'request-actions';
  
  if (isActive && (request.status === 'LYRICS' || request.status === 'MUSIC')) {
    // Cancel button
    const cancelBtn = createButton('Cancel', 'btn-danger', () => cancelRequest(request.id));
    actions.appendChild(cancelBtn);
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

function getCardClass(status) {
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

async function clearHistory() {
  if (confirm('Clear all completed and failed requests from history?')) {
    await browser.runtime.sendMessage({ action: 'clearHistory' });
    await loadData();
    renderUI();
  }
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
}

// Listen for updates from background
function setupMessageListener() {
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'requestsUpdated') {
      loadData().then(renderUI);
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


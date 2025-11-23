/**
 * Debug page script
 * Displays logs from Logger
 */

let logs = [];

// Load and display logs
async function loadLogs() {
  try {
    const result = await browser.storage.local.get(['debug_logs']);
    logs = result.debug_logs || [];
    displayLogs();
  } catch (e) {
    console.error('Failed to load logs:', e);
  }
}

function displayLogs() {
  const container = document.getElementById('log-container');
  const countEl = document.getElementById('log-count');
  const lastUpdatedEl = document.getElementById('last-updated');
  
  // Update stats
  countEl.textContent = logs.length;
  lastUpdatedEl.textContent = logs.length > 0 
    ? new Date(logs[logs.length - 1].timestamp).toLocaleString()
    : 'Never';
  
  // Display logs
  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-state">No logs yet. Use the extension and logs will appear here!</div>';
    return;
  }
  
  // Reverse to show newest first
  const reversedLogs = [...logs].reverse();
  
  container.innerHTML = reversedLogs.map(entry => {
    const emoji = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌',
      'debug': '🔍'
    }[entry.level] || '📝';
    
    return `
      <div class="log-entry ${entry.level}">
        <div class="log-header">
          <span class="log-level">${emoji} ${entry.level}</span>
          <span class="log-timestamp">${new Date(entry.timestamp).toLocaleString()}</span>
        </div>
        <div class="log-message">${escapeHtml(entry.message)}</div>
        ${entry.data ? `<div class="log-data">${escapeHtml(entry.data)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getLogsAsText() {
  return logs.map(entry => {
    let line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
    if (entry.data) {
      line += '\n' + entry.data;
    }
    return line;
  }).join('\n\n');
}

// Event listeners
document.getElementById('refresh').addEventListener('click', () => {
  loadLogs();
});

document.getElementById('export').addEventListener('click', async () => {
  const text = getLogsAsText();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `article-song-logs-${timestamp}.txt`;
  
  try {
    await browser.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
    alert(`✅ Logs exported as ${filename}`);
  } catch (e) {
    alert(`❌ Failed to export: ${e.message}`);
  }
});

document.getElementById('copy').addEventListener('click', () => {
  const text = getLogsAsText();
  navigator.clipboard.writeText(text).then(() => {
    alert('✅ Logs copied to clipboard!');
  }).catch(e => {
    alert(`❌ Failed to copy: ${e.message}`);
  });
});

document.getElementById('clear').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all logs?')) {
    await browser.storage.local.remove(['debug_logs']);
    logs = [];
    displayLogs();
    alert('✅ Logs cleared!');
  }
});

// Auto-refresh every 2 seconds
setInterval(loadLogs, 2000);

// Initial load
loadLogs();


/**
 * Logging System for Article Song
 * - Logs to console for real-time debugging
 * - Stores logs in browser.storage.local for persistence
 * - Logs can be viewed in debug.html or manually exported to file
 * 
 * DEVELOPMENT MODE:
 * - Automatic file downloads are DISABLED by default (production mode)
 * - To enable auto-downloads during development, uncomment the marked sections
 *   in init() and _addLog() methods
 */

const Logger = {
  logs: [],
  maxLogs: 1000, // Keep last 1000 log entries
  logFile: 'article-song-debug.log',
  autoSaveInterval: null,
  autoSaveFrequency: 10000, // Write to file every 10 seconds
  
  /**
   * Initialize logger - load existing logs from storage and start auto-save
   */
  async init() {
    try {
      const result = await chrome.storage.local.get(['debug_logs']);
      if (result.debug_logs) {
        this.logs = result.debug_logs;
      }
    } catch (e) {
      console.error('Failed to load logs from storage:', e);
    }
    
    // ========================================================================
    // 🔧 DEVELOPMENT MODE: Uncomment the line below to enable automatic log 
    //    file downloads every 10 seconds. This is useful for debugging but
    //    should be DISABLED for production to avoid constant file writes.
    // ========================================================================
    this.startAutoSave(); // ✅ ENABLED for Chrome development testing
  },
  
  /**
   * Start automatically writing logs to Downloads folder (Service Worker compatible)
   */
  startAutoSave() {
    // Write immediately
    this.writeToFile();
    
    // Use chrome.alarms API for Service Worker compatibility
    chrome.alarms.create('autoSaveLogs', {
      periodInMinutes: 0.167 // ~10 seconds
    });
    
    // Listen for the alarm
    if (!chrome.alarms.onAlarm.hasListener(this._handleAlarm)) {
      chrome.alarms.onAlarm.addListener(this._handleAlarm.bind(this));
    }
  },
  
  /**
   * Handle alarm for auto-save
   */
  _handleAlarm(alarm) {
    if (alarm.name === 'autoSaveLogs') {
      this.writeToFile();
    }
  },
  
  /**
   * Write current logs to Downloads folder as a fixed filename
   * Note: Service Workers don't have Blob/URL APIs, so this only works in popup/options
   */
  async writeToFile() {
    if (this.logs.length === 0) {
      return; // No logs to write
    }
    
    // Check if we're in a service worker context (no Blob API)
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      // Service worker context - can't create blob URLs
      // Logs are still saved to storage and viewable in console/debug page
      return;
    }
    
    try {
      const text = this.getLogsAsText();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      // Always use the same filename so I can read it easily
      await chrome.downloads.download({
        url: url,
        filename: 'article-song-debug.log',
        saveAs: false, // Don't prompt, just save
        conflictAction: 'overwrite' // Overwrite existing file
      });
      
      URL.revokeObjectURL(url);
    } catch (e) {
      // Don't log this error to avoid infinite loop
      console.error('Failed to write logs to file:', e);
    }
  },
  
  /**
   * Internal method to add a log entry
   */
  _addLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    
    // Add to memory
    this.logs.push(logEntry);
    
    // Trim if too many
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Save to storage (async, don't wait)
    this._saveToStorage();
    
    // ========================================================================
    // 🔧 DEVELOPMENT MODE: Uncomment below to write logs to file immediately
    //    on errors/success. Useful for debugging but disabled for production.
    // ========================================================================
    if (level === 'error' || level === 'success') {
      this.writeToFile(); // ✅ ENABLED for Chrome development testing
    }
    
    // Format for console
    const emoji = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌',
      'debug': '🔍'
    }[level] || '📝';
    
    const consoleMsg = `${emoji} [${timestamp}] ${message}`;
    
    // Log to console too
    if (level === 'error') {
      console.error(consoleMsg, data || '');
    } else if (level === 'warning') {
      console.warn(consoleMsg, data || '');
    } else {
      console.log(consoleMsg, data || '');
    }
  },
  
  /**
   * Save logs to storage
   */
  async _saveToStorage() {
    try {
      await chrome.storage.local.set({ debug_logs: this.logs });
    } catch (e) {
      console.error('Failed to save logs to storage:', e);
    }
  },
  
  /**
   * Public logging methods
   */
  info(message, data) {
    this._addLog('info', message, data);
  },
  
  success(message, data) {
    this._addLog('success', message, data);
  },
  
  warning(message, data) {
    this._addLog('warning', message, data);
  },
  
  error(message, data) {
    this._addLog('error', message, data);
  },
  
  debug(message, data) {
    this._addLog('debug', message, data);
  },
  
  /**
   * Get all logs as formatted text
   */
  getLogsAsText() {
    return this.logs.map(entry => {
      let line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
      if (entry.data) {
        line += '\n' + entry.data;
      }
      return line;
    }).join('\n\n');
  },
  
  /**
   * Export logs to downloads folder
   */
  async exportToFile() {
    const text = this.getLogsAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `article-song-logs-${timestamp}.txt`;
    
    try {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
      this.success('Logs exported to downloads', { filename });
      return filename;
    } catch (e) {
      this.error('Failed to export logs', e);
      throw e;
    }
  },
  
  /**
   * Clear all logs
   */
  async clear() {
    this.logs = [];
    await chrome.storage.local.remove(['debug_logs']);
    this.info('Logs cleared');
  },
  
  /**
   * Get logs (for debug page)
   */
  getLogs() {
    return this.logs;
  }
};

// Initialize on load
Logger.init();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logger;
}


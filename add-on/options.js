// Validation helpers
function validateAnthropicKey(key) {
  // Anthropic key is now optional - if empty, that's valid
  if (!key) return { valid: true, message: '' };
  if (!key.startsWith('sk-ant-')) return { valid: false, message: 'Key should start with sk-ant-' };
  if (key.length < 20) return { valid: false, message: 'Key appears too short' };
  return { valid: true, message: '' };
}

function validateSunoKey(key) {
  if (!key) return { valid: false, message: 'API key is required' };
  if (key.length < 10) return { valid: false, message: 'Key appears too short' };
  return { valid: true, message: '' };
}

function showValidationMessage(inputId, message) {
  const validationEl = document.getElementById(`${inputId.replace('_api_key', '')}-validation`);
  if (validationEl) {
    validationEl.textContent = message;
    validationEl.classList.add('show');
  }
}

function hideValidationMessage(inputId) {
  const validationEl = document.getElementById(`${inputId.replace('_api_key', '')}-validation`);
  if (validationEl) {
    validationEl.classList.remove('show');
  }
}

function showStatus(message, isSuccess = true) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status show ' + (isSuccess ? 'success' : 'error');
  
  setTimeout(() => {
    status.classList.remove('show');
  }, 3000);
}

function updateInputVisuals() {
  const inputs = ['anthropic_api_key', 'suno_api_key'];
  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (input.value.trim()) {
      input.classList.add('filled');
    } else {
      input.classList.remove('filled');
    }
  });
}

function saveOptions(e) {
  e.preventDefault();
  
  const anthropicKey = document.getElementById('anthropic_api_key').value.trim();
  const sunoKey = document.getElementById('suno_api_key').value.trim();
  const autoDownload = document.getElementById('auto_download').checked;
  const downloadDirectory = document.getElementById('download_directory').value.trim();
  const sunoModel = document.getElementById('suno_model').value;
  
  // Validate
  const anthropicValidation = validateAnthropicKey(anthropicKey);
  const sunoValidation = validateSunoKey(sunoKey);
  
  // Clear previous validation messages
  hideValidationMessage('anthropic_api_key');
  hideValidationMessage('suno_api_key');
  
  // Anthropic is optional, but if provided must be valid
  if (anthropicKey && !anthropicValidation.valid) {
    showValidationMessage('anthropic_api_key', anthropicValidation.message);
    showStatus('Please fix validation errors', false);
    return;
  }
  
  // Suno is required
  if (!sunoValidation.valid) {
    showValidationMessage('suno_api_key', sunoValidation.message);
    showStatus('Please fix validation errors', false);
    return;
  }
  
  // Disable button while saving
  const saveBtn = document.getElementById('save');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  // Save API keys to sync storage
  const syncPromise = browser.storage.sync.set({
    anthropic_api_key: anthropicKey,
    suno_api_key: sunoKey
  });
  
  // Save settings to local storage
  const localPromise = browser.storage.local.get('settings').then((result) => {
    const settings = result.settings || {};
    settings.autoDownload = autoDownload;
    settings.downloadDirectory = downloadDirectory;
    settings.sunoModel = sunoModel;
    return browser.storage.local.set({ settings });
  });
  
  Promise.all([syncPromise, localPromise]).then(() => {
    showStatus('Settings saved successfully!', true);
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
    updateInputVisuals();
  }).catch((error) => {
    showStatus('Failed to save: ' + error.message, false);
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  });
}

function restoreOptions() {
  // Load API keys from sync storage
  const syncPromise = browser.storage.sync.get(['anthropic_api_key', 'suno_api_key']).then((result) => {
    document.getElementById('anthropic_api_key').value = result.anthropic_api_key || '';
    document.getElementById('suno_api_key').value = result.suno_api_key || '';
  });
  
  // Load settings from local storage
  const localPromise = browser.storage.local.get(['settings', 'settingsError']).then((result) => {
    const settings = result.settings || {};
    document.getElementById('auto_download').checked = settings.autoDownload || false;
    // Show actual value - could be empty string, undefined (use default), or a custom value
    document.getElementById('download_directory').value = 
      settings.downloadDirectory !== undefined ? settings.downloadDirectory : 'ArticleSongs';
    // Set model - default to V5 if not set
    document.getElementById('suno_model').value = settings.sunoModel || 'V5';
    
    // Check for error message from background script
    if (result.settingsError) {
      showErrorAlert(result.settingsError);
      // Clear the error after showing it
      browser.storage.local.remove('settingsError');
    }
  });
  
  Promise.all([syncPromise, localPromise]).then(() => {
    updateInputVisuals();
  }).catch(console.error);
}

function showErrorAlert(errorType) {
  const errorAlert = document.getElementById('error-alert');
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');
  
  const errorMessages = {
    'anthropic_invalid': {
      title: 'Invalid Anthropic API Key',
      message: 'The Anthropic API key you entered appears to be invalid or has been revoked. Please check your key and try again.'
    },
    'suno_missing': {
      title: 'SunoAPI Key Required',
      message: 'You need to enter your SunoAPI key below to generate music. Get your key from sunoapi.org'
    },
    'suno_invalid': {
      title: 'Invalid SunoAPI Key',
      message: 'The SunoAPI key you entered appears to be invalid or has been revoked. Please check your key and try again.'
    }
  };
  
  const error = errorMessages[errorType];
  if (error) {
    errorTitle.textContent = error.title;
    errorMessage.textContent = error.message;
    errorAlert.style.display = 'block';
    
    // Focus the appropriate input field
    if (errorType.startsWith('anthropic')) {
      document.getElementById('anthropic_api_key').focus();
      document.getElementById('anthropic_api_key').select();
    } else if (errorType.startsWith('suno')) {
      document.getElementById('suno_api_key').focus();
      document.getElementById('suno_api_key').select();
    }
  }
}

function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const input = document.getElementById(targetId);
      
      if (input.type === 'password') {
        input.type = 'text';
        button.textContent = 'hide';
      } else {
        input.type = 'password';
        button.textContent = 'show';
      }
    });
  });
}

function setupInputListeners() {
  const inputs = ['anthropic_api_key', 'suno_api_key'];
  inputs.forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('input', updateInputVisuals);
    input.addEventListener('blur', () => {
      // Validate on blur
      const value = input.value.trim();
      if (value) {
        const validation = id === 'anthropic_api_key' 
          ? validateAnthropicKey(value)
          : validateSunoKey(value);
        
        if (!validation.valid) {
          showValidationMessage(id, validation.message);
        } else {
          hideValidationMessage(id);
        }
      }
    });
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      document.getElementById('save').click();
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  setupPasswordToggles();
  setupInputListeners();
  setupKeyboardShortcuts();
  document.querySelector('#save').addEventListener('click', saveOptions);
  
  // Focus first empty field
  const anthropicInput = document.getElementById('anthropic_api_key');
  const sunoInput = document.getElementById('suno_api_key');
  
  setTimeout(() => {
    if (!anthropicInput.value) {
      anthropicInput.focus();
    } else if (!sunoInput.value) {
      sunoInput.focus();
    }
  }, 100);
});

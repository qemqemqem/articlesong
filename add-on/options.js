// Settings page: every change saves on its own; keys can be tested against the real APIs.

// Validation helpers
function validateAnthropicKey(key) {
  // Anthropic key is optional - if empty, that's valid
  if (!key) return { valid: true, message: '' };
  if (!key.startsWith('sk-ant-')) return { valid: false, message: 'Anthropic keys start with sk-ant-' };
  if (key.length < 20) return { valid: false, message: 'That key looks too short' };
  return { valid: true, message: '' };
}

function validateSunoKey(key) {
  if (!key) return { valid: false, message: 'A SunoAPI key is required to make songs' };
  if (key.length < 10) return { valid: false, message: 'That key looks too short' };
  return { valid: true, message: '' };
}

function showValidationMessage(inputId, message) {
  const validationEl = document.getElementById(`${inputId.replace('_api_key', '')}-validation`);
  validationEl.textContent = message;
  validationEl.classList.toggle('show', !!message);
}

function showStatus(message, isSuccess = true) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'saved-toast show' + (isSuccess ? '' : ' error');
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => status.classList.remove('show'), isSuccess ? 1600 : 4000);
}

// ============================================================================
// Saving: keys go to sync storage, everything else to local settings
// ============================================================================

async function saveKey(id) {
  const value = document.getElementById(id).value.trim();
  const validation = id === 'anthropic_api_key' ? validateAnthropicKey(value) : validateSunoKey(value);
  showValidationMessage(id, validation.valid ? '' : validation.message);
  if (!validation.valid) return;
  try {
    await browser.storage.sync.set({ [id]: value });
    showStatus('Saved');
    testKey(id === 'suno_api_key' ? 'suno' : 'anthropic');
  } catch (error) {
    showStatus('Could not save: ' + error.message, false);
  }
}

async function saveSettings() {
  const autoDownload = document.getElementById('auto_download').checked;
  try {
    const { settings = {} } = await browser.storage.local.get('settings');
    Object.assign(settings, {
      autoDownload,
      downloadOnly: document.getElementById('download_only').checked && autoDownload,
      downloadDirectory: document.getElementById('download_directory').value.trim(),
      sunoModel: document.getElementById('suno_model').value,
      claudeModel: document.getElementById('claude_model').value.trim(),
      maxConcurrent: Number(document.getElementById('max_concurrent').value) || 1
    });
    await browser.storage.local.set({ settings });
    showStatus('Saved');
  } catch (error) {
    showStatus('Could not save: ' + error.message, false);
  }
}

function restoreOptions() {
  const syncPromise = browser.storage.sync.get(['anthropic_api_key', 'suno_api_key']).then((result) => {
    document.getElementById('anthropic_api_key').value = result.anthropic_api_key || '';
    document.getElementById('suno_api_key').value = result.suno_api_key || '';
  });

  const localPromise = browser.storage.local.get(['settings', 'settingsError']).then((result) => {
    const settings = result.settings || {};
    document.getElementById('auto_download').checked = settings.autoDownload || false;
    document.getElementById('download_only').checked = settings.downloadOnly || false;
    updateDownloadOnlyState();

    // Show actual value - could be empty string, undefined (use default), or a custom value
    document.getElementById('download_directory').value =
      settings.downloadDirectory !== undefined ? settings.downloadDirectory : 'ArticleSongs';
    document.getElementById('suno_model').value = settings.sunoModel || 'V6';
    document.getElementById('claude_model').value = settings.claudeModel || '';
    document.getElementById('max_concurrent').value = String(settings.maxConcurrent || 1);

    // Error sent by the background script (e.g. a key was rejected)
    if (result.settingsError) {
      showErrorAlert(result.settingsError);
      browser.storage.local.remove('settingsError');
    }
  });

  return Promise.all([syncPromise, localPromise]);
}

// ============================================================================
// Key tests: a real (free) call that proves the key works
// ============================================================================

const KEY_TESTS = {
  suno: {
    input: 'suno_api_key', result: 'suno-result', button: 'test-suno', action: 'testSunoKey',
    ok: r => r.credits >= 1
      ? `✓ Connected · ${Math.floor(r.credits).toLocaleString()} credits left`
      : '✓ Connected, but you have no credits left. Add credits to make songs.',
    warn: r => !(r.credits >= 1)
  },
  anthropic: {
    input: 'anthropic_api_key', result: 'anthropic-result', button: 'test-anthropic', action: 'testAnthropicKey',
    ok: r => `✓ Connected · lyrics will use ${r.model}`,
    warn: () => false
  }
};

async function testKey(which) {
  const test = KEY_TESTS[which];
  const key = document.getElementById(test.input).value.trim();
  const result = document.getElementById(test.result);
  const button = document.getElementById(test.button);
  if (!key) {
    result.className = 'check-result pending';
    result.textContent = which === 'anthropic'
      ? 'No key: SunoAPI writes the lyrics.'
      : 'Not connected yet: paste your key, then press Test.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Testing...';
  result.className = 'check-result pending';
  result.textContent = 'Checking the key...';
  try {
    const response = await browser.runtime.sendMessage({ action: test.action, key });
    if (!response || !response.success) throw new Error(response ? response.error : 'No answer from the extension');
    result.className = 'check-result ' + (test.warn(response) ? 'error' : 'ok');
    result.textContent = test.ok(response);
  } catch (error) {
    result.className = 'check-result error';
    result.textContent = `✗ ${error.message}`;
  } finally {
    button.disabled = !document.getElementById(test.input).value.trim();
    button.textContent = 'Test';
  }
}

// ============================================================================
// Page wiring
// ============================================================================

function showErrorAlert(errorType) {
  const errorMessages = {
    'anthropic_invalid': {
      title: 'Your Anthropic key was rejected',
      message: 'It may be mistyped or revoked. Paste a working key below, or clear it to let SunoAPI write the lyrics.'
    },
    'suno_missing': {
      title: 'Add your SunoAPI key to make songs',
      message: 'SunoAPI makes the music. Get a key at sunoapi.org and paste it below.'
    },
    'suno_invalid': {
      title: 'Your SunoAPI key was rejected',
      message: 'It may be mistyped or revoked. Paste a working key below and press Test.'
    }
  };

  const error = errorMessages[errorType];
  if (!error) return;
  document.getElementById('error-title').textContent = error.title;
  document.getElementById('error-message').textContent = error.message;
  document.getElementById('error-alert').style.display = 'block';
  const input = document.getElementById(errorType.startsWith('anthropic') ? 'anthropic_api_key' : 'suno_api_key');
  input.focus();
  input.select();
}

function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.getAttribute('data-target'));
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? 'Hide' : 'Show';
    });
  });
}

function updateDownloadOnlyState() {
  const autoDownload = document.getElementById('auto_download').checked;
  const downloadOnly = document.getElementById('download_only');
  downloadOnly.disabled = !autoDownload;
  if (!autoDownload) downloadOnly.checked = false;
  document.getElementById('download-only-label').classList.toggle('disabled', !autoDownload);
}

function openStyleEditor() {
  browser.tabs.create({ url: browser.runtime.getURL('styles.html') });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupPasswordToggles();
  await restoreOptions();

  ['suno_api_key', 'anthropic_api_key'].forEach(id => {
    const input = document.getElementById(id);
    const testButton = document.getElementById(id === 'suno_api_key' ? 'test-suno' : 'test-anthropic');
    const syncTestButton = () => { testButton.disabled = !input.value.trim(); };
    // `change` fires on blur or Enter, so a half-pasted key is never saved
    input.addEventListener('change', () => saveKey(id));
    input.addEventListener('input', syncTestButton);
    syncTestButton();
  });
  document.getElementById('test-suno').addEventListener('click', () => testKey('suno'));
  document.getElementById('test-anthropic').addEventListener('click', () => testKey('anthropic'));

  document.getElementById('auto_download').addEventListener('change', () => {
    updateDownloadOnlyState();
    saveSettings();
  });
  ['download_only', 'download_directory', 'suno_model', 'claude_model', 'max_concurrent'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveSettings);
  });
  document.getElementById('open-style-editor').addEventListener('click', openStyleEditor);

  // Show where things stand: test saved keys right away
  testKey('suno');
  testKey('anthropic');
  if (!document.getElementById('suno_api_key').value) document.getElementById('suno_api_key').focus();
});

// Style Editor Logic

let currentStyles = [];

// Initialize
async function init() {
  await loadStyles();
  renderStyles();
  setupEventListeners();
}

// Load styles from storage
async function loadStyles() {
  currentStyles = await loadCustomStyles();
}

// Render all styles
function renderStyles() {
  const container = document.getElementById('styles-list');
  container.innerHTML = '';
  
  currentStyles.forEach((style, index) => {
    const styleItem = createStyleItem(style, index);
    container.appendChild(styleItem);
  });
}

// Create a style item element
function createStyleItem(style, index) {
  const div = document.createElement('div');
  div.className = 'style-item';
  div.dataset.styleId = style.id;
  
  div.innerHTML = `
    <div class="style-header">
      <div class="style-number">${index + 1}</div>
      <input type="text" 
             class="style-name-input" 
             value="${escapeHtml(style.name)}"
             placeholder="Style Name"
             maxlength="30"
             data-style-id="${style.id}"
             data-field="name">
      <button class="reset-button" data-style-id="${style.id}">Reset</button>
    </div>
    <textarea class="style-description"
              placeholder="E.g., 'Rhythmic spoken word with slam poetry energy, raw and powerful'"
              data-style-id="${style.id}"
              data-field="description">${escapeHtml(style.description)}</textarea>
  `;
  
  // Add event listeners
  const nameInput = div.querySelector('.style-name-input');
  const descTextarea = div.querySelector('.style-description');
  const resetBtn = div.querySelector('.reset-button');
  
  nameInput.addEventListener('input', () => handleFieldChange(style.id, 'name', nameInput.value));
  descTextarea.addEventListener('input', () => handleFieldChange(style.id, 'description', descTextarea.value));
  resetBtn.addEventListener('click', () => handleResetStyle(style.id));
  
  return div;
}

// Generate ID from name (lowercase, spaces to underscores)
function generateIdFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
}

// Handle field change
function handleFieldChange(styleId, field, value) {
  const style = currentStyles.find(s => s.id === styleId);
  if (style) {
    style[field] = value;
    
    // If name changed, update the ID too
    if (field === 'name') {
      const newId = generateIdFromName(value);
      style.id = newId;
      console.log(`Style renamed: "${value}" (ID: ${newId})`);
    }
  }
}


// Reset individual style to default
function handleResetStyle(styleId) {
  const defaults = getDefaultStyles();
  const defaultStyle = defaults.find(s => s.id === styleId);
  
  if (!defaultStyle) return;
  
  if (!confirm(`Reset "${currentStyles.find(s => s.id === styleId).name}" to default?`)) {
    return;
  }
  
  const style = currentStyles.find(s => s.id === styleId);
  if (style) {
    style.name = defaultStyle.name;
    style.description = defaultStyle.description;
  }
  
  renderStyles();
  showStatus('Style reset to default', true);
}

// Reset all styles to defaults
async function handleResetAll() {
  if (!confirm('Reset ALL styles to defaults? This will erase your customizations.')) {
    return;
  }
  
  currentStyles = getDefaultStyles();
  renderStyles();
  showStatus('All styles reset to defaults', true);
}

// Save styles
async function handleSave() {
  // Validate
  const errors = validateStyles(currentStyles);
  if (errors.length > 0) {
    showStatus(errors[0], false);
    return;
  }
  
  // Disable button
  const saveBtn = document.getElementById('save');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    await saveCustomStyles(currentStyles);
    showStatus('Styles saved successfully!', true);
    
    // Notify other pages that styles have changed
    browser.runtime.sendMessage({ action: 'stylesUpdated' }).catch(() => {
      // Background script might not be listening, that's okay
    });
    
  } catch (error) {
    showStatus('Failed to save: ' + error.message, false);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

// Validate styles
function validateStyles(styles) {
  const errors = [];
  
  if (styles.length !== 6) {
    errors.push('Must have exactly 6 styles');
  }
  
  styles.forEach((style, index) => {
    if (!style.name || style.name.trim().length === 0) {
      errors.push(`Style ${index + 1}: Name is required`);
    }
    
    if (style.name.length > 30) {
      errors.push(`Style ${index + 1}: Name too long (max 30 characters)`);
    }
    
    if (!style.description || style.description.trim().length === 0) {
      errors.push(`Style ${index + 1}: Description is required`);
    }
    
    if (style.description.length < 20) {
      errors.push(`Style ${index + 1}: Description too short (minimum 20 characters)`);
    }
    
    if (style.description.length > 2000) {
      errors.push(`Style ${index + 1}: Description too long (max 2000 characters)`);
    }
  });
  
  return errors;
}

// Show status message
function showStatus(message, isSuccess = true) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status show ' + (isSuccess ? 'success' : 'error');
  
  setTimeout(() => {
    status.classList.remove('show');
  }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('save').addEventListener('click', handleSave);
  document.getElementById('reset-all').addEventListener('click', handleResetAll);
  document.getElementById('back-button').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('options.html') });
    window.close();
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  });
  
  // Warn before leaving if there are unsaved changes
  // (We won't implement dirty tracking for now, but could add later)
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);


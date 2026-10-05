// Style Editor Logic

let currentStyles = [];
let savedSnapshot = ''; // JSON of the styles as last saved, to tell when there are unsaved edits

// Initialize
async function init() {
  await loadStyles();
  savedSnapshot = JSON.stringify(currentStyles);
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
    container.appendChild(createStyleItem(style, index));
  });
  container.querySelectorAll('.style-description').forEach(autoGrow);
  updateDirtyState();
}

// Create a style item element
function createStyleItem(style, index) {
  const div = document.createElement('div');
  div.className = 'style-item';
  div.dataset.index = index;

  div.innerHTML = `
    <div class="style-header">
      <div class="style-number">${index + 1}</div>
      <div class="name-field">
        <label class="field-label" for="style-name-${index}">Button name</label>
        <input type="text" id="style-name-${index}" class="style-name-input"
               value="${escapeHtml(style.name)}" placeholder="Style name" maxlength="30">
      </div>
      <button class="text-button reset-button" title="Restore this style's default name and instructions">Reset</button>
    </div>
    <label class="field-label" for="style-desc-${index}">Instructions for the lyricist</label>
    <textarea id="style-desc-${index}" class="style-description"
              placeholder="E.g. rhythmic spoken word with slam poetry energy, raw and powerful">${escapeHtml(style.description)}</textarea>
  `;

  const nameInput = div.querySelector('.style-name-input');
  const descTextarea = div.querySelector('.style-description');
  const resetBtn = div.querySelector('.reset-button');

  nameInput.addEventListener('input', () => handleFieldChange(index, 'name', nameInput.value));
  descTextarea.addEventListener('input', () => {
    autoGrow(descTextarea);
    handleFieldChange(index, 'description', descTextarea.value);
  });
  resetBtn.addEventListener('click', () => armedConfirm(resetBtn, 'Click to confirm', () => handleResetStyle(index)));

  return div;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

// Generate ID from name (lowercase, spaces to underscores)
function generateIdFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
}

// Handle field change
function handleFieldChange(index, field, value) {
  const style = currentStyles[index];
  style[field] = value;
  // If name changed, update the ID too
  if (field === 'name') style.id = generateIdFromName(value);
  updateDirtyState();
}

function isDirty() {
  return JSON.stringify(currentStyles) !== savedSnapshot;
}

function updateDirtyState() {
  const dirty = isDirty();
  document.getElementById('save').disabled = !dirty;
  setSaveState(dirty ? 'Unsaved changes' : 'All changes saved', dirty ? 'dirty' : '');
  const saved = JSON.parse(savedSnapshot || '[]');
  document.querySelectorAll('.style-item').forEach(item => {
    const i = Number(item.dataset.index);
    item.classList.toggle('changed', JSON.stringify(currentStyles[i]) !== JSON.stringify(saved[i]));
  });
}

function setSaveState(text, kind = '') {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = 'save-state' + (kind ? ` ${kind}` : '');
}

// Two-step confirm without a blocking dialog: the first click arms the button for 4 seconds
function armedConfirm(button, armedLabel, onConfirm) {
  if (button.dataset.armed) {
    clearTimeout(Number(button.dataset.armed));
    delete button.dataset.armed;
    button.textContent = button.dataset.label;
    button.classList.remove('armed');
    onConfirm();
    return;
  }
  button.dataset.label = button.textContent;
  button.textContent = armedLabel;
  button.classList.add('armed');
  button.dataset.armed = String(setTimeout(() => {
    delete button.dataset.armed;
    button.textContent = button.dataset.label;
    button.classList.remove('armed');
  }, 4000));
}

// Reset one style to its default (matched by position: names and ids change when renamed)
function handleResetStyle(index) {
  const defaultStyle = getDefaultStyles()[index];
  if (!defaultStyle) return;
  currentStyles[index] = defaultStyle;
  renderStyles();
}

function handleResetAll() {
  currentStyles = getDefaultStyles();
  renderStyles();
}

// Save styles
async function handleSave() {
  const errors = validateStyles(currentStyles);
  if (errors.length > 0) {
    setSaveState(errors[0], 'error');
    return;
  }

  const saveBtn = document.getElementById('save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await saveCustomStyles(currentStyles);
    savedSnapshot = JSON.stringify(currentStyles);
    updateDirtyState();

    // Notify other pages that styles have changed
    browser.runtime.sendMessage({ action: 'stylesUpdated' }).catch(() => {
      // Background script might not be listening, that's okay
    });
  } catch (error) {
    setSaveState('Failed to save: ' + error.message, 'error');
    saveBtn.disabled = false;
  } finally {
    saveBtn.textContent = 'Save changes';
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
      errors.push(`Style ${index + 1}: Instructions are required`);
    }

    if (style.description.length < 20) {
      errors.push(`Style ${index + 1}: Instructions too short (minimum 20 characters)`);
    }

    if (style.description.length > 2000) {
      errors.push(`Style ${index + 1}: Instructions too long (max 2000 characters)`);
    }
  });

  return errors;
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
  const resetAll = document.getElementById('reset-all');
  resetAll.addEventListener('click', () => armedConfirm(resetAll, 'Click again to reset all six', handleResetAll));
  document.getElementById('back-button').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('options.html') });
    window.close();
  });

  // Ctrl+S or Cmd+S to save
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isDirty()) handleSave();
    }
  });

  // Warn before leaving with unsaved edits
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

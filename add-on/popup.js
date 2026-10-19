// Popup UI for Article Song
// Displays active requests and history

let requests = [];
let customStyles = []; // Loaded custom song styles
let selectionInfo = { hasSelection: false, selectedText: '', wordCount: 0 };
const cancellingIds = new Set(); // cancel clicked, waiting for the background to confirm
let pendingStart = null; // { name } while a song is being created (page read / PDF extraction)
let activeTab = null; // tab the popup was opened on
let useSelection = false; // Whether to use selected text for next song creation
let selectedStyleId = null; // chip picked in the style picker (a style id, 'straight' or 'custom')
let createExpanded = null; // null = automatic (style picker open unless something is going on)

// What each stage of a song in the studio says
const STATUS_TEXT = {
  RECEIVED: 'Reading the article...',
  LYRICS_ANTHROPIC: 'Writing lyrics with Claude...',
  LYRICS_SUNO: 'Writing lyrics with SunoAPI...',
  LYRICS: 'Writing lyrics...',
  MUSIC: 'Making the music...'
};

// Pipeline stages shown as a three-part progress bar
const STAGES = ['Read', 'Lyrics', 'Music'];
const STAGE_OF = { RECEIVED: 0, LYRICS: 1, MUSIC: 2 };

// One-line, human descriptions of the built-in styles (the stored descriptions are prompts for the lyricist)
const STYLE_BLURBS = {
  spoken: 'Rhythmic spoken word with a rap-style delivery.',
  musical: 'Verses and a big, catchy singalong chorus.',
  meme: 'Funny, absurd and internet-brained.',
  cute: 'Light-hearted and sweet, made to make you smile.',
  informative: 'Packs in the key facts and numbers.',
  pop: 'Radio-ready pop built around hooks.'
};
const STRAIGHT_STYLE = { id: 'straight', name: 'As written', description: '' };
const STRAIGHT_BLURB = 'Sings the text exactly as written. No new lyrics.';
const CUSTOM_BLURB = 'Describe any style you like: genre, mood, instruments, voice.';

const SUNO_CREDITS_URL = 'https://sunoapi.org/pricing';
const ANTHROPIC_BILLING_URL = 'https://console.anthropic.com/settings/billing';

const ICONS = {
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v8.2l3.1-3.1 1.4 1.4L12 16l-5.5-5.5 1.4-1.4 3.1 3.1zM5 18h14v2H5z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>',
  cancelled: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.9 7.9 0 0 1 4 12zm8 8a7.9 7.9 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z"/></svg>',
  retry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.6 6.4A8 8 0 1 0 19.7 14h-2.1a6 6 0 1 1-1.4-6.2L13 11h7V4z"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3zm5 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2z"/></svg>'
};

// Initialize popup
async function init() {
  await loadData();
  await loadStyles(); // Load custom styles
  await loadLastStyle();
  await checkSelection(); // Check for highlighted text
  const configured = await renderSetupState();
  renderStyleButtons(); // Render dynamic style buttons
  renderUI();
  await updateNowPlaying(); // Initial check
  if (configured) loadCredits(); // not awaited: the balance fills in when SunoAPI answers
  setupEventListeners();
  setupPlayerControls();
  setupQueueDragAndDrop('gen');
  setupQueueDragAndDrop('play');
  setupSetupCard();
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

// ============================================================================
// Style picker: choose a style, then press Create (a click on a style never spends credits by itself)
// ============================================================================

async function loadLastStyle() {
  try {
    const { lastStyleId } = await browser.storage.local.get('lastStyleId');
    if (lastStyleId) selectedStyleId = lastStyleId;
  } catch (error) {
    console.error('Could not load the last used style:', error);
  }
}

function pickerOptions() {
  return [
    ...customStyles.map(style => ({ id: style.id, label: style.name, style, blurb: STYLE_BLURBS[style.id] || '' })),
    { id: 'straight', label: STRAIGHT_STYLE.name, style: STRAIGHT_STYLE, blurb: STRAIGHT_BLURB, alt: true },
    { id: 'custom', label: 'Custom…', style: null, blurb: CUSTOM_BLURB, alt: true }
  ];
}

function selectedOption() {
  const options = pickerOptions();
  return options.find(o => o.id === selectedStyleId)
    || options.find(o => o.id === 'musical')
    || options[0];
}

function renderStyleButtons() {
  const container = document.getElementById('style-buttons');
  container.innerHTML = '';
  const current = selectedOption();
  selectedStyleId = current.id;
  pickerOptions().forEach(option => {
    const chip = document.createElement('button');
    chip.className = `chip${option.alt ? ' alt' : ''}`;
    chip.dataset.styleId = option.id;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(option.id === current.id));
    chip.textContent = option.label;
    chip.title = option.blurb ? `${option.label}: ${option.blurb}` : option.label;
    chip.addEventListener('click', () => selectStyle(option.id));
    container.appendChild(chip);
  });
  updateCreateCard();
}

function selectStyle(id) {
  selectedStyleId = id;
  document.querySelectorAll('#style-buttons .chip').forEach(chip => {
    chip.setAttribute('aria-checked', String(chip.dataset.styleId === id));
  });
  updateCreateCard();
  if (id === 'custom') document.getElementById('custom-style-input').focus();
  browser.storage.local.set({ lastStyleId: id }).catch(error => console.error('Could not remember the style:', error));
}

// Label, blurb and custom field follow the selected style; the card folds away while songs are in progress
function updateCreateCard() {
  const option = selectedOption();
  const isCustom = option.id === 'custom';
  document.getElementById('custom-style-input').style.display = isCustom ? 'block' : 'none';
  document.getElementById('style-blurb').textContent = option.blurb;
  if (!pendingStart) {
    document.getElementById('create-label').textContent =
      { custom: 'Create custom song', straight: 'Create song (as written)' }[option.id] || `Create ${option.label} song`;
  }

  const busy = requests.some(r => isActive(r.status) || r.status === 'QUEUED' || r.playQueuePos != null);
  const expanded = createExpanded === null ? !busy : createExpanded;
  const section = document.getElementById('create-section');
  section.classList.toggle('collapsible', busy || createExpanded !== null);
  section.classList.toggle('collapsed', !expanded);
  const toggle = document.getElementById('toggle-styles-btn');
  toggle.textContent = expanded ? 'Hide styles' : 'Change style';
  toggle.setAttribute('aria-expanded', String(expanded));
}

async function createSelectedSong() {
  const option = selectedOption();
  if (option.id === 'custom') {
    await createCustomStyleSong();
    return;
  }
  await createSong(option.style, document.getElementById('create-btn'));
}

// Inline message banner (alert() is blocking and ugly inside a popup)
const BANNER_STYLES = {
  error: { background: '#fff5f5', color: '#c53030', borderColor: '#fc8181' },
  info: { background: '#fffaf0', color: '#9c4221', borderColor: '#f6ad55' },
  success: { background: '#f0fff4', color: '#276749', borderColor: '#68d391' }
};

function showMessage(message, kind = 'error') {
  const banner = document.getElementById('error-banner');
  Object.assign(banner.style, BANNER_STYLES[kind], { display: 'block' });
  banner.textContent = message;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { banner.style.display = 'none'; }, 8000);
}

function showError(message) {
  showMessage(message, 'error');
}

// Load data from background
let loadSeq = 0;
async function loadData() {
  const seq = ++loadSeq;
  const response = await browser.runtime.sendMessage({ action: 'getRequests' });
  if (seq !== loadSeq) return; // a newer load started meanwhile; this snapshot is stale
  if (response) {
    requests = response.requests || [];
  }
}

function countWords(text) {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

// Highlighted text in the active tab (any frame), or text sent over from the "Make a song from the selection" menu
async function checkSelection() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  activeTab = tabs[0] || null;
  if (activeTab) {
    const { text } = await browser.runtime.sendMessage({ action: 'getSelection', tabId: activeTab.id, tabUrl: activeTab.url });
    const wordCount = countWords(text);
    if (wordCount > 0) {
      selectionInfo = { hasSelection: true, selectedText: text, wordCount };
      useSelection = true; // Auto-enable if text is selected
    }
  }
  renderSourceLine(activeTab);
}

// Placeholder card shown from the click until the background confirms the request
function renderPendingStart() {
  const container = document.getElementById('active-requests');
  let card = document.getElementById('pending-card');
  if (!pendingStart) {
    if (card) card.remove();
    return;
  }
  if (!card) {
    card = document.createElement('div');
    card.id = 'pending-card';
    card.className = 'request-card active';
    card.innerHTML = '<div class="request-title"></div>' +
      '<div class="request-status"><span class="spinner"></span><span>Reading the page...</span></div>';
  }
  if (container.firstElementChild !== card) container.prepend(card);
  card.querySelector('.request-title').textContent = (activeTab && activeTab.title) || `New "${pendingStart.name}" song`;
}

// Render the entire UI
function renderUI() {
  if (!pendingStart) renderPendingStart(); // drop a stale placeholder even if we return early below
  // The playing song lives in the player widget, so the studio list only holds songs still being made
  const activeRequests = requests.filter(r => isMaking(r.status));
  const queuedList = requests.filter(r => r.status === 'QUEUED').sort((a, b) => a.queuePos - b.queuePos);
  const playQueued = requests.filter(r => r.status === 'COMPLETE' && r.playQueuePos != null).sort((a, b) => a.playQueuePos - b.playQueuePos);
  const historyRequests = requests.filter(r => !isActive(r.status) && r.status !== 'QUEUED' && r.playQueuePos == null).slice(0, 20);
  
  // Update counts
  document.getElementById('active-count').textContent = activeRequests.length + (pendingStart ? 1 : 0);
  document.getElementById('history-count').textContent = historyRequests.length;
  
  // Show/hide sections
  const activeSection = document.getElementById('active-section');
  const historySection = document.getElementById('history-section');
  const emptyState = document.getElementById('empty-state');
  
  if (requests.length === 0 && !pendingStart) {
    ['active-requests', 'history-requests', 'queue-requests', 'play-queue-requests'].forEach(id => { document.getElementById(id).innerHTML = ''; });
    document.getElementById('queue-section').style.display = 'none';
    document.getElementById('play-queue-section').style.display = 'none';
    activeSection.style.display = 'none';
    historySection.style.display = 'none';
    emptyState.style.display = 'block';
    hideNowPlaying();
    updateCreateCard();
    return;
  }
  
  emptyState.style.display = 'none';
  activeSection.style.display = activeRequests.length > 0 || pendingStart ? 'block' : 'none';
  historySection.style.display = historyRequests.length > 0 ? 'block' : 'none';
  
  // Render active requests
  renderRequestList(activeRequests, 'active-requests', true);
  renderPendingStart(); // after the list so the placeholder sits on top
  
  renderQueue('play', playQueued);
  renderQueue('gen', queuedList);
  updateUpNext(playQueued);
  
  // Render history
  renderRequestList(historyRequests, 'history-requests', false, createHistoryRow, historySignature);
  
  updateCreateCard();
}

// Fields that change what a card looks like; anything else is a live update
function cardSignature(request) {
  return JSON.stringify([
    request.status, request.lyricsProvider, request.title, request.articleTitle, styleNameOf(request),
    !!request.lyrics, request.statusNote, request.rewriteNote, cancellingIds.has(request.id)
  ]);
}

// Progress bar and timer change every second; update them without rebuilding the card
function updateCardLive(card, request) {
  const elapsed = Math.max(0, Math.floor((Date.now() - request.timestamps.created) / 1000));
  const estimated = (request.progress && request.progress.estimated) || 180;
  const stage = STAGE_OF[request.status] ?? 0;
  card.querySelectorAll('.step').forEach((step, i) => {
    let percent = i < stage ? 100 : 0;
    if (i === stage) {
      if (stage === 0) percent = 50;
      else if (stage === 1) percent = 10 + Math.min(elapsed / 40, 1) * 80; // lyrics take ~30-60s
      else percent = 10 + Math.min(elapsed / estimated, 1) * 85; // never shows "done" before it is
    }
    step.classList.toggle('done', i < stage);
    step.classList.toggle('current', i === stage);
    step.querySelector('.step-fill').style.width = `${percent}%`;
  });
  
  const timeEl = card.querySelector('.js-time');
  if (timeEl) timeEl.textContent = `${formatTime(elapsed)} · ${timeLeftText(estimated - elapsed)}`;
}

function timeLeftText(seconds) {
  if (seconds > 90) return `about ${Math.round(seconds / 60)} min left`;
  if (seconds > 40) return 'about a minute left';
  if (seconds > 0) return 'less than a minute left';
  return 'almost done...';
}

// Reconcile the list against existing cards so unchanged cards keep their DOM nodes.
// (Rebuilding every card each second made buttons swap out under the cursor and eat clicks.)
function renderRequestList(requestList, containerId, isActive, build = createRequestCard, signatureOf = cardSignature) {
  const container = document.getElementById(containerId);
  const existing = new Map([...container.querySelectorAll('[data-request-id]:not(#pending-card)')]
    .map(card => [card.dataset.requestId, card]));
  
  let previous = null;
  requestList.forEach((request, index) => {
    const signature = signatureOf(request, index, requestList.length);
    let card = existing.get(request.id);
    if (!card || card.dataset.signature !== signature) {
      const fresh = build(request, isActive, index, requestList.length);
      fresh.dataset.signature = signature;
      if (card) card.replaceWith(fresh); else container.appendChild(fresh);
      card = fresh;
    }
    existing.delete(request.id);
    if (build === createRequestCard) updateCardLive(card, request);
    
    // keep DOM order == list order
    const expectedNext = previous ? previous.nextElementSibling : container.firstElementChild;
    if (card !== expectedNext) container.insertBefore(card, expectedNext);
    previous = card;
  });
  existing.forEach(card => card.remove()); // requests that are gone
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function styleNameOf(request) {
  const style = request.songStyle;
  if (!style) return '';
  return typeof style === 'object' ? style.name : style;
}

// Song title once Suno has named it, the article before that; the other one becomes the subtitle
function titleLines(request) {
  if (request.title && request.title !== request.articleTitle) {
    return { title: request.title, from: `from ${request.articleTitle}` };
  }
  return { title: request.articleTitle, from: '' };
}

// A song in the studio: what stage it is in, how long it has taken, and Cancel
function createRequestCard(request) {
  const card = el('div', 'request-card active');
  card.dataset.requestId = request.id;
  
  const { title, from } = titleLines(request);
  const top = el('div', 'card-top');
  const text = el('div', 'card-text');
  const titleEl = el('div', 'request-title', title);
  titleEl.title = request.articleTitle;
  text.appendChild(titleEl);
  if (from) text.appendChild(el('div', 'request-sub', from));
  top.appendChild(text);
  
  const cancelling = cancellingIds.has(request.id);
  const cancelBtn = createButton(cancelling ? 'Cancelling...' : 'Cancel', 'btn-danger-outline', () => cancelRequest(request.id));
  cancelBtn.disabled = cancelling;
  top.appendChild(cancelBtn);
  card.appendChild(top);
  
  const stepper = el('div', 'stepper');
  STAGES.forEach(name => {
    const step = el('div', 'step');
    const bar = el('div', 'step-bar');
    bar.appendChild(el('div', 'step-fill'));
    step.append(bar, el('div', 'step-label', name));
    stepper.appendChild(step);
  });
  card.appendChild(stepper);
  
  let statusKey = request.status;
  if (request.status === 'LYRICS' && request.lyricsProvider === 'anthropic') statusKey = 'LYRICS_ANTHROPIC';
  if (request.status === 'LYRICS' && request.lyricsProvider === 'suno') statusKey = 'LYRICS_SUNO';
  const status = el('div', 'request-status');
  status.append(el('span', 'spinner'), el('span', null, STATUS_TEXT[statusKey] || STATUS_TEXT.RECEIVED), el('span', 'js-time'));
  card.appendChild(status);
  
  const meta = el('div', 'request-meta');
  if (styleNameOf(request)) meta.appendChild(el('span', 'style-tag', styleNameOf(request)));
  card.appendChild(meta);
  
  const note = request.statusNote || (request.rewrites ? request.rewriteNote : null);
  if (note) card.appendChild(el('div', 'request-note', note));
  
  if (request.lyrics) card.appendChild(lyricsDetails(request.lyrics));
  return card;
}

function lyricsDetails(lyrics) {
  const details = el('details', 'lyrics');
  details.append(el('summary', null, 'Lyrics'), el('pre', null, lyrics));
  return details;
}

// Turn raw API errors into what happened and what to do about it
function describeFailure(error = '') {
  if (/insufficient SunoAPI credits|insufficient credits|not enough credits/i.test(error)) {
    return { kind: 'suno-credits', text: "You're out of SunoAPI credits. Add credits, then press Try again. Your article is saved." };
  }
  if (/credit balance is too low/i.test(error)) {
    return { kind: 'anthropic-credits', text: 'Your Anthropic account is out of credits. Add credits, or remove the Claude key in Settings to let SunoAPI write the lyrics.' };
  }
  if (/\b(401|403)\b/.test(error)) {
    return { kind: 'key', text: 'An API key was rejected. Check your keys in Settings.' };
  }
  return { kind: 'other', text: error || 'Something went wrong.' };
}

function historySignature(request) {
  return JSON.stringify([
    request.status, request.title, request.articleTitle, request.imageUrl, request.error, request.playbackNote,
    !!request.lyrics, !!request.styleTags, styleNameOf(request),
    request.timestamps.completed && formatRelativeTime(request.timestamps.completed)
  ]);
}

// A finished, failed or cancelled song: compact row with the one action that matters most up front
function createHistoryRow(request) {
  const row = el('div', 'request-card song-row');
  row.dataset.requestId = request.id;
  
  const art = el('div', 'song-art');
  if (request.status === 'FAILED') {
    art.classList.add('failed');
    art.innerHTML = ICONS.warn;
  } else if (request.status === 'CANCELLED') {
    art.classList.add('cancelled');
    art.innerHTML = ICONS.cancelled;
  } else {
    art.innerHTML = ICONS.note;
    if (request.imageUrl) {
      art.style.backgroundImage = `url("${request.imageUrl}")`;
      art.classList.add('has-image');
    }
  }
  row.appendChild(art);
  
  const { title, from } = titleLines(request);
  const text = el('div', 'card-text');
  const titleEl = el('div', 'request-title', title);
  titleEl.title = request.articleTitle;
  text.appendChild(titleEl);
  const when = request.timestamps.completed ? formatRelativeTime(request.timestamps.completed) : '';
  const prefix = { FAILED: 'Failed', CANCELLED: 'Cancelled' }[request.status];
  const sub = [prefix, from, styleNameOf(request), when].filter(Boolean).join(' · ');
  const subEl = el('div', 'request-sub', sub);
  subEl.title = sub;
  text.appendChild(subEl);
  row.appendChild(text);
  
  if (request.status === 'COMPLETE') {
    if (request.playbackNote) text.appendChild(el('div', 'warn-message', request.playbackNote));
    const actions = el('div', 'row-actions');
    const play = createButton('Play', 'btn-primary', () => playAgain(request.id));
    play.insertAdjacentHTML('afterbegin', ICONS.play);
    play.setAttribute('aria-label', `Play ${title}`);
    actions.append(play, moreMenuButton(row, request));
    row.appendChild(actions);
    return row;
  }
  
  const buttons = el('div', 'row-buttons');
  if (request.status === 'FAILED') {
    const failure = describeFailure(request.error);
    const message = el('div', 'error-message', failure.text);
    message.title = request.error || '';
    text.appendChild(message);
    if (failure.kind === 'suno-credits' || failure.kind === 'anthropic-credits') {
      const url = failure.kind === 'suno-credits' ? SUNO_CREDITS_URL : ANTHROPIC_BILLING_URL;
      const add = createButton('Add credits', 'btn-primary', () => openTab(url));
      add.insertAdjacentHTML('beforeend', ICONS.external);
      buttons.append(add, createButton('Try again', 'btn-secondary', () => retryRequest(request.id)));
    } else if (failure.kind === 'key') {
      buttons.append(
        createButton('Open settings', 'btn-primary', () => browser.runtime.openOptionsPage()),
        createButton('Try again', 'btn-secondary', () => retryRequest(request.id))
      );
    } else {
      buttons.appendChild(createButton('Try again', 'btn-primary', () => retryRequest(request.id)));
    }
  } else {
    buttons.appendChild(createButton('Try again', 'btn-secondary', () => retryRequest(request.id)));
  }
  const remove = createButton('Remove', 'btn-secondary', () => removeRequest(request.id));
  remove.title = 'Remove from recent songs';
  buttons.appendChild(remove);
  text.appendChild(buttons);
  return row;
}

// "⋯" menu with the less frequent actions of a finished song
function moreMenuButton(row, request) {
  const button = el('button', 'round-btn');
  button.innerHTML = ICONS.more;
  button.title = 'More actions';
  button.setAttribute('aria-label', 'More actions');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = row.querySelector('.menu');
    closeMenus();
    if (open) return;
    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    const item = (icon, label, onClick, danger = false) => {
      const entry = el('button', danger ? 'danger' : '');
      entry.setAttribute('role', 'menuitem');
      entry.innerHTML = icon;
      entry.appendChild(document.createTextNode(label));
      entry.addEventListener('click', () => { closeMenus(); onClick(); });
      menu.appendChild(entry);
    };
    item(ICONS.download, 'Download', () => downloadRequest(request.id));
    if (request.lyrics) item(ICONS.copy, 'Copy lyrics', () => copyToClipboard(request.lyrics, 'Lyrics'));
    if (request.styleTags) item(ICONS.copy, 'Copy Suno style tags', () => copyToClipboard(request.styleTags, 'Style tags'));
    item(ICONS.trash, 'Remove from recent songs', () => removeRequest(request.id), true);
    row.appendChild(menu);
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  });
  return button;
}

function closeMenus() {
  document.querySelectorAll('.menu').forEach(menu => menu.remove());
  document.querySelectorAll('[aria-haspopup="menu"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

// Helper functions
function isActive(status) {
  return ['RECEIVED', 'LYRICS', 'MUSIC', 'PLAYING'].includes(status);
}

function isMaking(status) {
  return ['RECEIVED', 'LYRICS', 'MUSIC'].includes(status);
}

function createButton(text, className, onClick) {
  const btn = document.createElement('button');
  btn.className = `btn ${className}`;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
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
  cancellingIds.add(requestId);
  renderUI(); // show "Cancelling..." immediately
  try {
    await browser.runtime.sendMessage({ action: 'cancelRequest', requestId });
  } catch (error) {
    showError('Could not cancel: ' + error.message);
  } finally {
    cancellingIds.delete(requestId);
    await loadData();
    renderUI();
  }
}

async function downloadRequest(requestId) {
  await browser.runtime.sendMessage({ 
    action: 'downloadRequest', 
    requestId 
  });
}

async function playAgain(requestId) {
  try {
    const response = await browser.runtime.sendMessage({ action: 'playAgain', requestId });
    if (response && !response.success) showError(response.error || 'Could not play this song');
  } catch (error) {
    showError('Could not play this song: ' + error.message);
  }
  await loadData();
  renderUI();
}

async function retryRequest(requestId) {
  const response = await browser.runtime.sendMessage({ action: 'retryRequest', requestId });
  if (response && !response.success) showMessage(response.error, response.duplicate ? 'info' : 'error');
  await loadData();
  renderUI();
}

async function removeRequest(requestId) {
  await browser.runtime.sendMessage({ action: 'removeRequest', requestId });
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

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showMessage(`${label} copied to the clipboard.`, 'success');
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    showError(`Failed to copy ${label.toLowerCase()}: ${error.message}`);
  }
}

// ============================================================================
// Queue ("Up next")
// ============================================================================

const ICON = {
  grip: '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/><circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'
};

// Two queues share one row component: songs waiting to be generated ("gen") and finished songs
// waiting for the current one to end ("play").
const QUEUE_KINDS = {
  gen:  { listId: 'queue-requests',      sectionId: 'queue-section',      countId: 'queue-count',      reorder: 'reorderQueue',     posField: 'queuePos' },
  play: { listId: 'play-queue-requests', sectionId: 'play-queue-section', countId: 'play-queue-count', reorder: 'reorderPlayQueue', posField: 'playQueuePos' }
};

let dragState = null; // { kind, id, targetId, after } while a queue row is being dragged
let justAddedId = null; // newly queued song to flash + scroll into view

function queueSignature(request, index, total) {
  return JSON.stringify([request.articleTitle, request.title, request.duration, request.songStyle && request.songStyle.name, index, total, cancellingIds.has(request.id)]);
}

function queueButton(className, svg, label, onClick, disabled = false) {
  const btn = document.createElement('button');
  btn.className = `queue-btn ${className}`;
  btn.innerHTML = svg;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

function buildQueueRow(kind, request, index, total) {
  const row = document.createElement('li');
  row.className = `queue-row${index === 0 ? ' next' : ''}`;
  row.dataset.requestId = request.id;
  row.draggable = true;
  
  const grip = document.createElement('span');
  grip.className = 'queue-grip';
  grip.innerHTML = ICON.grip;
  grip.title = 'Drag to reorder';
  
  const num = document.createElement('span');
  num.className = 'queue-num';
  num.textContent = String(index + 1);
  
  const text = document.createElement('div');
  text.className = 'queue-text';
  const title = document.createElement('div');
  title.className = 'queue-title';
  const shownTitle = kind === 'play' ? (request.title || request.articleTitle) : request.articleTitle;
  title.textContent = shownTitle;
  title.title = shownTitle;
  const sub = document.createElement('div');
  sub.className = 'queue-sub';
  if (index === 0) {
    const pill = document.createElement('span');
    pill.className = 'next-pill';
    pill.textContent = kind === 'play' ? 'Plays next' : 'Starts next';
    sub.appendChild(pill);
  }
  const detail = [request.songStyle ? (request.songStyle.name || request.songStyle) : ''];
  if (kind === 'play' && request.duration) detail.push(formatTime(Math.floor(request.duration)));
  const style = document.createElement('span');
  style.textContent = detail.filter(Boolean).join(' \u00b7 ');
  sub.appendChild(style);
  text.append(title, sub);
  
  const actions = document.createElement('div');
  actions.className = 'queue-actions';
  const moveUp = queueButton('up', ICON.up, 'Move up', () => moveQueued(kind, request.id, -1), index === 0);
  const moveDown = queueButton('down', ICON.down, 'Move down', () => moveQueued(kind, request.id, 1), index === total - 1);
  if (kind === 'play') {
    actions.append(
      queueButton('play-now', ICON.play, 'Play now', () => playAgain(request.id)),
      moveUp, moveDown,
      queueButton('remove', ICON.close, 'Remove from the play queue', () => removeFromPlayQueue(request.id))
    );
  } else {
    actions.append(moveUp, moveDown, queueButton('remove', ICON.close, 'Remove from queue', () => cancelRequest(request.id)));
  }
  
  row.append(grip, num, text, actions);
  return row;
}

const createQueueRow = (request, isActive, index, total) => buildQueueRow('gen', request, index, total);
const createPlayRow = (request, isActive, index, total) => buildQueueRow('play', request, index, total);

function renderQueue(kind, list) {
  const cfg = QUEUE_KINDS[kind];
  document.getElementById(cfg.sectionId).style.display = list.length > 0 ? 'block' : 'none';
  document.getElementById(cfg.countId).textContent = list.length;
  if (dragState) return; // never rebuild rows under an in-progress drag
  renderRequestList(list, cfg.listId, false, kind === 'play' ? createPlayRow : createQueueRow, queueSignature);
  
  if (justAddedId) {
    const row = document.querySelector(`#${cfg.listId} [data-request-id="${justAddedId}"]`);
    if (row) {
      row.classList.add('just-added');
      row.scrollIntoView({ block: 'nearest' });
      justAddedId = null;
    }
  }
}

function queuedIdsInOrder(kind) {
  return [...document.querySelectorAll(`#${QUEUE_KINDS[kind].listId} .queue-row`)].map(r => r.dataset.requestId);
}

// Apply a new order locally right away, then tell the background
async function applyQueueOrder(kind, orderedIds) {
  const cfg = QUEUE_KINDS[kind];
  orderedIds.forEach((id, i) => {
    const request = requests.find(r => r.id === id);
    if (request) request[cfg.posField] = i;
  });
  renderUI();
  try {
    await browser.runtime.sendMessage({ action: cfg.reorder, orderedIds });
  } catch (error) {
    showError('Could not reorder the queue: ' + error.message);
  }
  await loadData();
  renderUI();
}

async function moveQueued(kind, id, delta) {
  const ids = queuedIdsInOrder(kind);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await applyQueueOrder(kind, ids);
}

async function removeFromPlayQueue(requestId) {
  await browser.runtime.sendMessage({ action: 'removeFromPlayQueue', requestId });
  await loadData();
  renderUI();
}

async function playNextSong() {
  playerEpoch++;
  try {
    const response = await browser.runtime.sendMessage({ action: 'playNext' });
    if (response && !response.success) showError(response.error || 'Could not skip to the next song');
  } catch (error) {
    showError('Could not skip to the next song: ' + error.message);
  }
  await loadData();
  renderUI();
}

function clearDragIndicators() {
  document.querySelectorAll('.queue-row').forEach(r => r.classList.remove('dragging', 'drop-before', 'drop-after'));
}

function setupQueueDragAndDrop(kind) {
  const list = document.getElementById(QUEUE_KINDS[kind].listId);
  
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.queue-row');
    if (!row) return;
    dragState = { kind, id: row.dataset.requestId, targetId: null, after: false };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragState.id);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  
  list.addEventListener('dragover', (e) => {
    if (!dragState || dragState.kind !== kind) return; // rows only move within their own queue
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.queue-row');
    document.querySelectorAll('.queue-row').forEach(r => r.classList.remove('drop-before', 'drop-after'));
    if (!row || row.dataset.requestId === dragState.id) {
      dragState.targetId = null;
      return;
    }
    const rect = row.getBoundingClientRect();
    dragState.targetId = row.dataset.requestId;
    dragState.after = e.clientY > rect.top + rect.height / 2;
    row.classList.add(dragState.after ? 'drop-after' : 'drop-before');
  });
  
  list.addEventListener('drop', async (e) => {
    if (!dragState || dragState.kind !== kind) return;
    e.preventDefault();
    const { id, targetId, after } = dragState;
    dragState = null;
    clearDragIndicators();
    if (!targetId) return;
    const ids = queuedIdsInOrder(kind).filter(x => x !== id);
    const at = ids.indexOf(targetId) + (after ? 1 : 0);
    ids.splice(at, 0, id);
    await applyQueueOrder(kind, ids);
  });
  
  list.addEventListener('dragend', () => {
    dragState = null;
    clearDragIndicators();
    renderUI(); // catch up on anything that changed during the drag
  });
}

// ============================================================================
// Music player widget
// ============================================================================

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const SKIP_SECONDS = 10;

let currentPlayingRequest = null;
let isPlaying = true; // Assume playing by default when song starts
let isSeeking = false; // true while the user drags the seek slider
let knownDuration = null; // seconds, from the audio element or Suno metadata

// Playback state is read from the player (a tab or the background page) by polling. Every user command
// bumps playerEpoch so replies that were already in flight when the command was sent are discarded
// instead of undoing it.
let playerEpoch = 0;
let playerMisses = 0; // consecutive polls that found no live audio
const MAX_PLAYER_MISSES = 6; // ~3s of silence before we conclude the audio is really gone

async function updateNowPlaying() {
  const playingRequest = requests.find(r => r.status === 'PLAYING');
  if (!playingRequest) {
    if (currentPlayingRequest) hideNowPlaying();
    return;
  }
  if (!currentPlayingRequest || currentPlayingRequest.id !== playingRequest.id) playerMisses = 0;
  currentPlayingRequest = playingRequest;
  showNowPlaying(playingRequest);
}

// Read the player's state once and show it. Returns 'ok', 'miss' or 'gone'.
async function syncPlayer() {
  const request = currentPlayingRequest;
  if (!request) return 'ok';
  const epoch = playerEpoch;
  let state = null;
  try {
    state = await browser.runtime.sendMessage({ action: 'validatePlaying', requestId: request.id });
  } catch (error) {
    // popup closing, tab busy or navigating: counts as a miss, never as proof the song stopped
  }
  const stale = epoch !== playerEpoch || !currentPlayingRequest || currentPlayingRequest.id !== request.id;
  if (stale) return 'ok';
  if (!state || !state.isPlaying) {
    playerMisses++;
    return playerMisses >= MAX_PLAYER_MISSES ? 'gone' : 'miss';
  }
  playerMisses = 0;
  if (!isSeeking) {
    isPlaying = !state.isPaused;
    updatePlayPauseButton();
    renderProgress(state.currentTime, state.duration || request.duration);
  }
  return 'ok';
}

function showNowPlaying(request) {
  const player = document.getElementById('now-playing');
  
  const kicker = document.getElementById('now-playing-title');
  kicker.classList.toggle('streaming', !!request.isStreaming);
  document.getElementById('player-kicker-text').textContent =
    request.isStreaming ? 'Playable now' : 'Now playing';
  kicker.title = request.isStreaming ? 'You can listen already; the full-quality version is still being generated.' : '';
  
  const { title, from } = titleLines(request);
  document.getElementById('player-song-title').textContent = title;
  document.getElementById('player-song-title').title = title;
  document.getElementById('now-playing-subtitle').textContent = [from, styleNameOf(request)].filter(Boolean).join(' · ');
  
  const download = document.getElementById('player-download-btn');
  download.disabled = !!request.isStreaming;
  download.title = request.isStreaming ? 'Download (available once full quality is ready)' : 'Download';
  download.setAttribute('aria-label', download.title);
  
  const lyricsBtn = document.getElementById('player-lyrics-btn');
  lyricsBtn.style.display = request.lyrics ? '' : 'none';
  document.getElementById('player-lyrics').textContent = request.lyrics || '';
  if (!request.lyrics) setPlayerLyricsOpen(false);
  
  const art = document.getElementById('player-art');
  if (request.imageUrl) {
    art.style.backgroundImage = `url("${request.imageUrl}")`;
    art.classList.add('has-image');
  } else {
    art.style.backgroundImage = '';
    art.classList.remove('has-image');
  }
  
  player.style.display = 'block';
  updatePlayPauseButton();
}

function setPlayerLyricsOpen(open) {
  document.getElementById('player-lyrics').style.display = open ? 'block' : 'none';
  const button = document.getElementById('player-lyrics-btn');
  button.title = open ? 'Hide lyrics' : 'Show lyrics';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-expanded', String(open));
}

function hideNowPlaying() {
  document.getElementById('now-playing').style.display = 'none';
  currentPlayingRequest = null;
  knownDuration = null;
}

function updatePlayPauseButton() {
  document.getElementById('play-pause-icon').innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
  const btn = document.getElementById('play-pause-btn');
  const label = isPlaying ? 'Pause' : 'Play';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  document.getElementById('now-playing').classList.toggle('paused', !isPlaying);
}

function renderProgress(currentTime, duration) {
  const seek = document.getElementById('player-seek');
  const hasDuration = Number.isFinite(duration) && duration > 0;
  knownDuration = hasDuration ? duration : null;
  
  document.getElementById('player-current').textContent = formatTime(Math.floor(currentTime || 0));
  document.getElementById('player-duration').textContent = hasDuration ? formatTime(Math.floor(duration)) : '--:--';
  seek.disabled = !hasDuration;
  
  if (!isSeeking) {
    const fraction = hasDuration ? Math.min((currentTime || 0) / duration, 1) : 0;
    seek.value = Math.round(fraction * 1000);
    seek.style.setProperty('--pct', `${fraction * 100}%`);
  }
}

// Tick (twice a second): refresh position/state of the playing song; tear the widget down if the audio is gone
async function pollPlayback() {
  if (!currentPlayingRequest) return;
  if (await syncPlayer() === 'gone') {
    const id = currentPlayingRequest.id;
    playerMisses = 0;
    await browser.runtime.sendMessage({ action: 'stopPlaying', requestId: id });
    await loadData();
    renderUI();
  }
}

async function seekAudio(payload) {
  if (!currentPlayingRequest) return;
  playerEpoch++;
  try {
    const response = await browser.runtime.sendMessage({
      action: 'seekAudio',
      requestId: currentPlayingRequest.id,
      ...payload
    });
    if (response && !response.success) throw new Error(response.error);
  } catch (error) {
    console.error('Seek failed:', error);
    showError('Could not seek: ' + error.message);
  }
  playerEpoch++;
  await syncPlayer();
}

// Optimistic and idempotent: flip the button at once and send the state we want (not "toggle"),
// so rapid clicks and slow replies can never leave the button disagreeing with the audio.
async function togglePlayPause() {
  if (!currentPlayingRequest) {
    console.error('No current playing request');
    return;
  }
  const desired = !isPlaying;
  playerEpoch++;
  isPlaying = desired;
  updatePlayPauseButton();
  try {
    const response = await browser.runtime.sendMessage({
      action: 'togglePlayPause',
      requestId: currentPlayingRequest.id,
      playing: desired
    });
    if (response && response.success) {
      isPlaying = response.isPlaying;
    } else {
      isPlaying = !desired;
      showError('Playback control failed: ' + (response && response.error));
    }
  } catch (error) {
    isPlaying = !desired;
    showError('Playback control failed: ' + error.message);
  }
  playerEpoch++; // drop any status reply that was already in flight
  updatePlayPauseButton();
}

// "Up next" hint + the skip button in the player widget
function updateUpNext(playQueued) {
  const next = playQueued[0];
  document.getElementById('next-btn').disabled = !next;
  document.getElementById('player-upnext').textContent = next ? `Up next: ${next.title || next.articleTitle}` : '';
}

function setupPlayerControls() {
  document.getElementById('next-btn').addEventListener('click', playNextSong);
  document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
  document.getElementById('back-btn').addEventListener('click', () => seekAudio({ delta: -SKIP_SECONDS }));
  document.getElementById('fwd-btn').addEventListener('click', () => seekAudio({ delta: SKIP_SECONDS }));
  document.getElementById('stop-btn').addEventListener('click', async () => {
    if (currentPlayingRequest) await stopPlaying(currentPlayingRequest.id);
  });
  document.getElementById('player-download-btn').addEventListener('click', () => {
    if (currentPlayingRequest) downloadRequest(currentPlayingRequest.id);
  });
  document.getElementById('player-lyrics-btn').addEventListener('click', () => {
    setPlayerLyricsOpen(document.getElementById('player-lyrics').style.display === 'none');
  });
  
  const seek = document.getElementById('player-seek');
  seek.addEventListener('input', () => {
    isSeeking = true;
    const fraction = seek.value / 1000;
    seek.style.setProperty('--pct', `${fraction * 100}%`);
    if (knownDuration) {
      document.getElementById('player-current').textContent = formatTime(Math.floor(fraction * knownDuration));
    }
  });
  let seekPending = false;
  seek.addEventListener('change', async () => {
    seekPending = true;
    try {
      if (knownDuration) await seekAudio({ time: (seek.value / 1000) * knownDuration });
    } finally {
      seekPending = false;
      isSeeking = false;
    }
  });
  // A drag that ends where it began fires `input` but never `change`; don't stay locked in "seeking"
  const releaseSeekLock = () => setTimeout(() => { if (!seekPending) isSeeking = false; }, 250);
  ['pointerup', 'pointercancel', 'keyup', 'blur'].forEach(type => seek.addEventListener(type, releaseSeekLock));
}

// ============================================================================
// Setup (credentials) + source indicator
// ============================================================================

const SUNO_KEY_URL = 'https://sunoapi.org/api-key';
const ANTHROPIC_KEY_URL = 'https://console.anthropic.com/settings/keys';

async function hasSunoKey() {
  const { suno_api_key } = await browser.storage.sync.get('suno_api_key');
  return !!(suno_api_key && suno_api_key.trim());
}

async function renderSetupState() {
  const configured = await hasSunoKey();
  document.getElementById('create-section').classList.toggle('locked', !configured);
  document.body.classList.toggle('unconfigured', !configured);
  document.getElementById('setup-card').style.display = configured ? 'none' : 'block';
  return configured;
}

function openTab(url) {
  browser.tabs.create({ url });
  window.close();
}

async function saveSunoKeyFromPopup() {
  const input = document.getElementById('suno-key-input');
  const key = input.value.trim();
  if (key.length < 10) {
    showError('That key looks too short. Copy the full key from the SunoAPI key page.');
    return;
  }
  await browser.storage.sync.set({ suno_api_key: key });
  input.value = '';
  await renderSetupState();
  loadCredits();
}

function setupSetupCard() {
  document.getElementById('get-suno-key').addEventListener('click', () => openTab(SUNO_KEY_URL));
  document.getElementById('get-claude-key').addEventListener('click', (e) => {
    e.preventDefault();
    openTab(ANTHROPIC_KEY_URL);
  });
  document.getElementById('save-suno-key').addEventListener('click', saveSunoKeyFromPopup);
  document.getElementById('suno-key-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveSunoKeyFromPopup();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.suno_api_key) renderSetupState();
  });
}

function isPdfUrl(url) {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// "What will be sung": highlighted words, PDF, or the page
// Firefox won't let add-ons read file:// URLs, so for a PDF on disk Create asks the user to pick the file
function isLocalPdf(tab) {
  return !!tab && /^file:/i.test(tab.url) && isPdfUrl(tab.url);
}

function sourceHint(tab) {
  if (selectionInfo.hasSelection) return '';
  if (isLocalPdf(tab)) return "Firefox doesn't let add-ons open files on your computer, so Create will ask you to pick this PDF.";
  // The popup can't see a selection inside Firefox's PDF viewer, but the context menu can
  if (tab && isPdfUrl(tab.url)) return 'Want just part of it? Highlight it, right-click and choose "Make a song from the selection".';
  return 'Want just part of the page? Highlight it before opening ArticleSong.';
}

function renderSourceLine(tab) {
  const line = document.getElementById('source-line');
  line.innerHTML = '';
  line.appendChild(el('span', null, 'From:'));
  document.getElementById('source-hint').textContent = sourceHint(tab);
  const pageLabel = tab && isPdfUrl(tab.url) ? 'PDF document' : 'Whole page';
  if (!selectionInfo.hasSelection) {
    line.appendChild(el('span', 'pill', pageLabel));
    return;
  }
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Text to turn into a song');
  [[true, `Highlighted · ${selectionInfo.wordCount} words`], [false, pageLabel]].forEach(([value, label]) => {
    const option = el('button', null, label);
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(useSelection === value));
    option.addEventListener('click', () => {
      useSelection = value;
      renderSourceLine(tab);
    });
    seg.appendChild(option);
  });
  line.appendChild(seg);
}

// SunoAPI reports fractional credits (e.g. 482.8); show whole credits everywhere
function formatCredits(credits) {
  return Math.floor(credits).toLocaleString();
}

// SunoAPI balance under the Create button, so spending is never a surprise
async function loadCredits() {
  let response;
  try {
    response = await browser.runtime.sendMessage({ action: 'getSunoCredits' });
  } catch (error) {
    response = { success: false, error: error.message };
  }
  renderCredits(response);
}

function renderCredits(response) {
  const line = document.getElementById('credits-line');
  line.classList.remove('out');
  line.title = '';
  const base = 'Takes about 3 minutes and uses SunoAPI credits';
  if (response && typeof response.credits === 'number') {
    if (response.credits >= 1) {
      line.textContent = `${base} (${formatCredits(response.credits)} left).`;
      return;
    }
    line.classList.add('out');
    line.textContent = "You're out of SunoAPI credits. ";
    const link = el('a', null, 'Add credits ↗');
    link.href = '#';
    link.addEventListener('click', (e) => { e.preventDefault(); openTab(SUNO_CREDITS_URL); });
    line.appendChild(link);
    return;
  }
  if (response && response.error) {
    line.textContent = `${base}. Couldn't check your balance.`;
    line.title = response.error;
    return;
  }
  line.textContent = `${base}.`;
}

// Two-step confirm without a blocking dialog: first click arms the link, a second click within 4s confirms
const armedLinks = new WeakMap();
function armedConfirm(link, armedLabel, onConfirm) {
  const armed = armedLinks.get(link);
  if (!armed) {
    const original = link.textContent;
    link.textContent = armedLabel;
    const timer = setTimeout(() => { link.textContent = original; armedLinks.delete(link); }, 4000);
    armedLinks.set(link, { original, timer });
    return;
  }
  clearTimeout(armed.timer);
  link.textContent = armed.original;
  armedLinks.delete(link);
  onConfirm();
}

async function clearHistory() {
  armedConfirm(document.getElementById('clear-history-btn'), 'Click again to clear', async () => {
    await browser.runtime.sendMessage({ action: 'clearHistory' });
    await loadData();
    renderUI();
  });
}

// Lock the create controls so a second click can't start a second song
function setCreateBusy(busy) {
  document.querySelectorAll('#create-section button, #create-section input').forEach(el => {
    if (busy) {
      el.dataset.wasDisabled = el.disabled ? '1' : '';
      el.disabled = true;
    } else {
      el.disabled = el.dataset.wasDisabled === '1';
    }
  });
  document.getElementById('create-section').classList.toggle('busy', busy);
  document.getElementById('create-btn').classList.toggle('starting', busy);
  if (busy) {
    document.getElementById('create-label').textContent = 'Starting...';
    document.querySelector('#create-btn svg').replaceWith(el('span', 'spinner'));
  } else {
    const spinner = document.querySelector('#create-btn .spinner');
    if (spinner) spinner.outerHTML = ICONS.note;
    updateCreateCard();
  }
}

// Returns true if a song was started
async function createSong(style) {
  if (pendingStart) return false; // a start is already in progress
  const styleName = typeof style === 'object' ? style.name : style;
  pendingStart = { name: styleName };
  setCreateBusy(true);
  renderUI(); // placeholder card appears right away
  
  try {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      showError('No active tab found');
      return false;
    }
    
    const tab = tabs[0];
    const shouldUseSelection = useSelection && selectionInfo.hasSelection;
    if (!shouldUseSelection && isLocalPdf(tab)) {
      await openPdfPicker(tab, style);
      return true;
    }
    
    const response = await browser.runtime.sendMessage({ 
      action: 'createSong',
      songStyle: style,
      tabId: tab.id,
      tabTitle: tab.title,
      tabUrl: tab.url,
      text: shouldUseSelection ? selectionInfo.selectedText : null
    });
    
    if (response && !response.success) {
      // Missing-key errors open the settings page themselves
      if (response.error && response.error.includes('not configured')) return false;
      showMessage(response.error || 'Could not start the song', response.duplicate ? 'info' : 'error');
      return false;
    }
    
    if (response && response.queued) {
      justAddedId = response.requestId;
      showMessage(`Added to the queue: #${response.position} up next. It will start on its own.`, 'success');
    } else {
      showMessage(`Started a "${styleName}" song. It will keep working if you close this popup.`, 'success');
    }
    return true;
  } catch (error) {
    console.error('Failed to create song:', error);
    showError('Failed to create song: ' + error.message);
    return false;
  } finally {
    pendingStart = null;
    setCreateBusy(false);
    await loadData();
    renderUI();
  }
}

// open-pdf.html reads the file the user picks and starts the song with this style
async function openPdfPicker(tab, style) {
  const params = new URLSearchParams({ tabId: tab.id, url: tab.url, title: tab.title || '', style: JSON.stringify(style) });
  await browser.tabs.create({ url: `open-pdf.html?${params}`, openerTabId: tab.id });
  window.close();
}

async function createCustomStyleSong() {
  const input = document.getElementById('custom-style-input');
  const customStyle = input.value.trim();
  
  if (!customStyle) {
    showError('Describe the style you want first, e.g. "sea shanty with a female choir".');
    createExpanded = true;
    updateCreateCard();
    input.focus();
    return;
  }
  
  // Keep the text if creation failed so it can be retried
  if (await createSong(customStyle)) {
    input.value = '';
  }
}

// Event listeners
function setupEventListeners() {
  document.getElementById('settings-btn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  
  document.getElementById('clear-play-queue-btn').addEventListener('click', (e) => {
    armedConfirm(e.currentTarget, 'Click again to clear', async () => {
      await browser.runtime.sendMessage({ action: 'clearPlayQueue' });
      await loadData();
      renderUI();
    });
  });
  
  document.getElementById('clear-queue-btn').addEventListener('click', (e) => {
    armedConfirm(e.currentTarget, 'Click again to cancel all', async () => {
      await browser.runtime.sendMessage({ action: 'clearQueue' });
      await loadData();
      renderUI();
    });
  });
  
  document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
  
  document.getElementById('create-btn').addEventListener('click', createSelectedSong);
  document.getElementById('custom-style-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createSelectedSong();
  });
  document.getElementById('toggle-styles-btn').addEventListener('click', () => {
    const section = document.getElementById('create-section');
    createExpanded = section.classList.contains('collapsed');
    updateCreateCard();
  });
  
  // Close "⋯" menus on any outside click or Escape
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
  });
}

// Listen for updates from background
function setupMessageListener() {
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'requestsUpdated') {
      // The background broadcasts on every state change (several per second while generating): coalesce
      clearTimeout(setupMessageListener.timer);
      setupMessageListener.timer = setTimeout(() => {
        loadData().then(() => {
          renderUI();
          updateNowPlaying();
        });
      }, 80);
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

// Advance the progress bar twice a second
setInterval(pollPlayback, 500);


// Renders popup.html in Chrome with a stubbed `browser` API and saves screenshots.
// Usage: node tests/popup-screens.js [outDir]
const { chromium } = require('playwright-core');
const path = require('path');
const out = process.argv[2] || '.';

const stub = (state) => `
  const state = ${JSON.stringify(state)};
  let t = state.currentTime;
  window.browser = {
    storage: {
      sync: { get: async () => state.sync, set: async (o) => Object.assign(state.sync, o) },
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener() {} }
    },
    tabs: { query: async () => [{ id: 1, url: state.url, title: 'Page' }], sendMessage: async () => ({ hasSelection: false }), create: async () => {} },
    runtime: {
      openOptionsPage() {},
      onMessage: { addListener() {} },
      sendMessage: async (m) => {
        if (m.action === 'getRequests') return { requests: state.requests, settings: {} };
        if (m.action === 'validatePlaying') { t += 0.5; return { isPlaying: true, isPaused: false, currentTime: t, duration: state.duration }; }
        if (m.action === 'seekAudio') { t = m.time ?? t + m.delta; return { success: true }; }
        return { success: true };
      }
    }
  };`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const url = 'file://' + path.resolve(__dirname, '../add-on/popup.html');
  const now = Date.now();
  const base = { timestamps: { created: now - 60000, completed: null }, songStyle: { id: 'musical', name: 'Musical' }, progress: {} };
  const scenarios = {
    'setup': { sync: {}, url: 'https://example.com/a', requests: [], currentTime: 0, duration: 0 },
    'playing': {
      sync: { suno_api_key: 'x'.repeat(20) }, url: 'https://example.com/paper.pdf', currentTime: 74, duration: 183,
      requests: [
        { ...base, id: 'r1', status: 'PLAYING', articleTitle: 'The Waggle Dance of Honeybees', title: 'Dance of the Hive', isStreaming: false, lyrics: 'la', styleTags: 'folk', audioUrl: 'x' },
        { ...base, id: 'r2', status: 'FAILED', articleTitle: 'Another article', error: 'Suno API error 429: insufficient SunoAPI credits', timestamps: { created: now - 9e5, completed: now - 8e5 } }
      ]
    }
  };
  for (const [name, state] of Object.entries(scenarios)) {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(stub(state));
    await page.goto(url);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(out, `popup-${name}.png`) });
    console.log(name, errors.length ? 'ERRORS: ' + errors.join('; ') : 'ok');
    await page.close();
  }
  await browser.close();
})();

// Background-script flow tests with a stubbed browser + fake network (no real API calls).
// Covers: cancel, duplicate-start guard, retry guard, dismiss.
// Usage: node tests/background-flow.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeEnv({ anthropicHangs = true } = {}) {
  const store = { sync: { suno_api_key: 'k'.repeat(20), anthropic_api_key: 'sk-ant-test' }, local: {} };
  const listeners = [];
  const fetchLog = [];
  const area = name => ({
    get: async k => (Array.isArray(k) ? Object.fromEntries(k.map(x => [x, store[name][x]])) : { [k]: store[name][k] }),
    set: async o => Object.assign(store[name], o),
    remove: async k => { delete store[name][k]; }
  });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, URL, Promise, Blob: globalThis.Blob,
    document: { createElement: () => ({}), head: { appendChild() {} } },
    browser: {
      storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } },
      runtime: {
        getURL: p => p, openOptionsPage() {}, onMessage: { addListener: f => listeners.push(f) },
        sendMessage: () => Promise.resolve()
      },
      tabs: {
        sendMessage: async (id, m) => (m.action === 'getText' ? { text: 'Article body about honeybees. '.repeat(20) } : { status: 'ok' }),
        query: async () => [{ id: 1 }]
      },
      menus: { create() {}, onClicked: { addListener() {} } },
      browserAction: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      notifications: { create() {} },
      downloads: { download: async () => 1 }
    },
    fetch: (url, opts = {}) => new Promise((resolve, reject) => {
      fetchLog.push(url);
      const json = (status, body) => resolve({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
      if (url.includes('/v1/models')) return json(200, { data: [{ id: 'claude-opus-5-5' }] });
      if (url.includes('/v1/messages')) {
        if (!anthropicHangs) return json(200, { content: [{ type: 'text', text: 'la la la' }] });
        // hang until aborted, like a slow real request
        opts.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
        return;
      }
      return json(200, { code: 200, data: { taskId: 't1' } });
    })
  };
  vm.createContext(ctx);
  ['logger.js', 'prompts.js', 'claude.js', 'pdf.js', 'background.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../add-on', f), 'utf8'), ctx, { filename: f }));
  const send = msg => new Promise(resolve => {
    const keep = listeners[0](msg, {}, resolve);
    if (keep !== true) resolve(undefined);
  });
  const requests = () => vm.runInContext('allRequests', ctx);
  return { ctx, send, requests, fetchLog, store };
}

const tick = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); if (!ok) failures++; };
const song = { tabId: 1, tabUrl: 'https://x.org/a', tabTitle: 'A', songStyle: { id: 'musical', name: 'Musical' } };

(async () => {
  {
    const env = makeEnv();
    await tick(50);
    const r = await env.send({ action: 'createSong', ...song });
    check('createSong succeeds', r && r.success, JSON.stringify(r));
    await tick(50);
    const id = env.requests()[0].id;
    check('request is active in LYRICS', env.requests()[0].status === 'LYRICS', env.requests()[0].status);

    const c = await env.send({ action: 'cancelRequest', requestId: id });
    check('cancel responds success', c && c.success);
    await tick(30);
    check('cancelled request becomes CANCELLED', env.requests()[0].status === 'CANCELLED', env.requests()[0].status);
    check('no further Suno calls after cancel', !env.fetchLog.some(u => u.includes('sunoapi')), env.fetchLog.join(','));
  }
  {
    const env = makeEnv();
    await tick(50);
    // two rapid identical clicks, sent before the first resolves
    const [a, b] = await Promise.all([env.send({ action: 'createSong', ...song }), env.send({ action: 'createSong', ...song })]);
    await tick(50);
    check('double click starts exactly one song', env.requests().length === 1, `got ${env.requests().length}`);
    check('second click is reported as duplicate', [a, b].filter(x => x.success).length === 1 && [a, b].some(x => x.duplicate), JSON.stringify([a, b]));
    const other = await env.send({ action: 'createSong', ...song, songStyle: { id: 'pop', name: 'Pop' } });
    check('a different style is allowed concurrently', other.success && env.requests().length === 2);
  }
  {
    const env = makeEnv();
    await tick(50);
    await env.send({ action: 'createSong', ...song });
    await tick(30);
    const id = env.requests()[0].id;
    await env.send({ action: 'cancelRequest', requestId: id });
    await tick(30);
    const [r1, r2] = await Promise.all([env.send({ action: 'retryRequest', requestId: id }), env.send({ action: 'retryRequest', requestId: id })]);
    await tick(50);
    check('double-clicked retry starts one song', env.requests().filter(r => r.status === 'LYRICS').length === 1, env.requests().map(r => r.status).join(','));
    const d = await env.send({ action: 'removeRequest', requestId: id });
    check('removeRequest dismisses a finished card', d.success && !env.requests().some(r => r.id === id));
    const active = env.requests().find(r => r.status === 'LYRICS');
    await env.send({ action: 'removeRequest', requestId: active.id });
    check('removeRequest refuses active requests', env.requests().some(r => r.id === active.id));
  }
  {
    // A page that yields only a cookie banner must not become a song
    const { makeEnv: mk } = require('./helpers/background-env');
    const env = mk(); await tick(30);
    env.pageText = 'Neuralink stores data in your browser. Accept All. Decline.';
    const r = await env.send({ action: 'createSong', tabId: 1, tabUrl: 'https://x.org/spa', tabTitle: 'SPA', songStyle: { id: 'musical', name: 'Musical' } });
    check('banner-only page text is refused with a helpful error', r.success === false && /Could not find the article/.test(r.error) && /highlight/i.test(r.error), JSON.stringify(r));
    check('and nothing was queued or sent to Claude', env.requests().length === 0 && !env.fetchLog.some(u => u.includes('/messages')));
    env.pageText = undefined;
    const ok = await env.send({ action: 'createSong', tabId: 1, tabUrl: 'https://x.org/spa', tabTitle: 'SPA', songStyle: { id: 'musical', name: 'Musical' } });
    check('a real article still works', ok.success === true, JSON.stringify(ok));
  }
  process.exit(failures ? 1 : 0);
})();

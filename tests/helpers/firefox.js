// Real headless Firefox with the add-on installed, driven over WebDriver (geckodriver).
// Firefox-only behaviour (content scripts in frames, the built-in PDF viewer, file:// limits) can't be
// checked in Chrome, so these tests run where the add-on actually ships.
// Needs `firefox` and `geckodriver` on PATH (or FIREFOX_BIN / GECKODRIVER).
const { spawn, execFileSync } = require('child_process');
const net = require('net');
const path = require('path');

const ADDON_DIR = path.resolve(__dirname, '../../add-on');
const ADDON_ID = 'richardson.andrew@gmail.com';
const UUID = 'a7c1e7a0-5000-4000-8000-000000000001'; // fixed so tests can open moz-extension:// pages
const EXT = `moz-extension://${UUID}`;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function launchFirefox() {
  const port = await freePort();
  // --allow-system-access lets openExtensionPage() run script in browser chrome
  const driver = spawn(process.env.GECKODRIVER || 'geckodriver', ['--port', String(port), '--allow-system-access'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const killDriver = () => {
    try { driver.kill(); } catch {
      // AppArmor blocks signalling the snap's geckodriver from outside; signal it from inside the snap
      execFileSync('snap', ['run', '--shell', 'firefox', '-c', `kill ${driver.pid}`]);
    }
  };
  let log = '';
  driver.stdout.on('data', d => { log += d; });
  driver.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;

  async function call(method, url, body) {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const json = await res.json();
    if (json.value && json.value.error) throw new Error(`${method} ${url}: ${json.value.error}: ${json.value.message}`);
    return json.value;
  }
  for (let i = 0; ; i++) {
    try { await call('GET', '/status'); break; } catch (e) {
      if (i > 50) throw new Error(`geckodriver did not start: ${e.message}\n${log}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const firefoxOptions = {
    args: ['-headless'],
    prefs: { 'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: UUID }) }
  };
  if (process.env.FIREFOX_BIN) firefoxOptions.binary = process.env.FIREFOX_BIN;
  let s;
  try {
    const session = await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': firefoxOptions } } });
    s = `/session/${session.sessionId}`;
    await call('POST', `${s}/moz/addon/install`, { path: ADDON_DIR, temporary: true });
  } catch (error) {
    if (s) await call('DELETE', s).catch(() => {});
    killDriver();
    throw error;
  }

  const ff = {
    EXT,
    call: (method, url, body) => call(method, s + url, body),
    navigate: url => call('POST', `${s}/url`, { url }),
    // Runs `fn(...args)` in the current tab; fn may be async. Firefox wraps it like executeAsyncScript.
    run: (fn, ...args) => call('POST', `${s}/execute/async`, {
      script: `const done = arguments[arguments.length - 1];
        Promise.resolve((${fn})(...Array.from(arguments).slice(0, -1)))
          .then(v => done({ ok: true, v }), e => done({ ok: false, e: String(e && e.message || e) }));`,
      args
    }).then(r => { if (!r.ok) throw new Error(r.e); return r.v; }),
    newTab: async () => (await call('POST', `${s}/window/new`, { type: 'tab' })).handle,
    // WebDriver refuses to navigate to moz-extension:// URLs, so open the page from browser chrome. It gets a
    // window of its own so the tab under test stays the active tab (the popup reads the active tab).
    async openExtensionPage(page) {
      const before = await call('GET', `${s}/window/handles`);
      await call('POST', `${s}/moz/context`, { context: 'chrome' });
      try {
        await call('POST', `${s}/execute/async`, {
          script: `const [url, done] = arguments;
            const win = OpenBrowserWindow();
            Services.obs.addObserver(function ready(subject) {
              if (subject !== win) return;
              Services.obs.removeObserver(ready, 'browser-delayed-startup-finished');
              // load into the window's only tab, so the page is the one new window handle
              win.gBrowser.selectedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
              done();
            }, 'browser-delayed-startup-finished');`,
          args: [`${EXT}/${page}`]
        });
      } finally {
        await call('POST', `${s}/moz/context`, { context: 'content' });
      }
      const added = (await call('GET', `${s}/window/handles`)).filter(h => !before.includes(h));
      if (added.length !== 1) throw new Error(`expected one new window for ${page}, got ${added.length}`);
      const handle = added[0];
      await call('POST', `${s}/window`, { handle });
      for (let i = 0; !(await ff.run(() => document.readyState === 'complete' && typeof browser !== 'undefined').catch(() => false)); i++) {
        if (i > 50) throw new Error(`${page} did not load as an extension page`);
        await new Promise(r => setTimeout(r, 100));
      }
      return handle;
    },
    currentTab: () => call('GET', `${s}/window`),
    switchTo: handle => call('POST', `${s}/window`, { handle }),
    find: css => call('POST', `${s}/element`, { using: 'css selector', value: css }).then(e => Object.values(e)[0]),
    switchToFrame: index => call('POST', `${s}/frame`, { id: index }),
    // A real right-click at viewport coordinates of the current tab (opens the content context menu)
    rightClick: (x, y) => call('POST', `${s}/actions`, { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', x, y }, { type: 'pointerDown', button: 2 }, { type: 'pointerUp', button: 2 }
    ] }] }),
    // Runs a script body in browser chrome (where gBrowser and the context menus live)
    async inChrome(script, ...args) {
      await call('POST', `${s}/moz/context`, { context: 'chrome' });
      try {
        return await call('POST', `${s}/execute/sync`, { script, args });
      } finally {
        await call('POST', `${s}/moz/context`, { context: 'content' });
      }
    },
    switchToTopFrame: () => call('POST', `${s}/frame`, { id: null }),
    sendKeys: (elementId, text) => call('POST', `${s}/element/${elementId}/value`, { text }),
    async quit() {
      try { await call('DELETE', s); } finally {
        killDriver();
      }
    }
  };
  return ff;
}

module.exports = { launchFirefox, EXT };

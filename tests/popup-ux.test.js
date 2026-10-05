// UX tests for the popup in real Chrome with a stateful stub of the extension API.
// Usage: node tests/popup-ux.test.js   (needs playwright-core and Google Chrome)
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../add-on/popup.html');

// Stub with a tiny in-page "background": createSong takes `createDelay` ms, cancel flips status.
const stub = (opts) => `
  const opts = ${JSON.stringify(opts)};
  const now = Date.now();
  window.__sent = [];
  window.__requests = opts.requests.map(r => ({ ...r, timestamps: { created: now - 5000, completed: ['LYRICS', 'QUEUED'].includes(r.status) ? null : now - 1000 }, progress: { estimated: 180 } }));
  window.__failNext = opts.failCreate;
  window.browser = {
    storage: { sync: { get: async () => ({ suno_api_key: 'x'.repeat(20) }), set: async () => {} }, local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
    tabs: { query: async () => [{ id: 1, url: 'https://example.com/post', title: 'A Post' }], sendMessage: async () => ({ hasSelection: false }), create: async () => {} },
    runtime: {
      openOptionsPage() {}, onMessage: { addListener() {} },
      sendMessage: async (m) => {
        window.__sent.push(m.action);
        if (m.action === 'getRequests') return { requests: window.__requests, settings: {} };
        if (m.action === 'createSong') {
          await new Promise(r => setTimeout(r, opts.createDelay));
          if (window.__failNext) return { success: false, error: 'Boom: could not read page' };
          window.__requests.unshift({ id: 'new' + window.__requests.length, status: 'LYRICS', articleTitle: 'A Post', songStyle: m.songStyle, lyricsProvider: 'anthropic', timestamps: { created: Date.now(), completed: null }, progress: { estimated: 180 } });
          return { success: true };
        }
        if (m.action === 'cancelRequest') { const r = window.__requests.find(r => r.id === m.requestId); if (r) { r.status = 'CANCELLED'; r.timestamps.completed = Date.now(); } return { success: true }; }
        if (m.action === 'removeRequest') { window.__requests = window.__requests.filter(r => r.id !== m.requestId); return { success: true }; }
        if (m.action === 'getSunoCredits') return opts.credits != null ? { success: true, credits: opts.credits } : { success: false, error: 'SunoAPI error: 500 - offline' };
        return { success: true };
      }
    }
  };`;

let failures = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); if (!ok) failures++; };
const sent = (page, action) => page.evaluate(a => window.__sent.filter(x => x === a).length, action);

async function open(browser, opts) {
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  page.on('pageerror', e => { failures++; console.log('FAIL page error:', e.message); });
  await page.addInitScript(stub({ requests: [], createDelay: 600, ...opts }));
  await page.goto(url);
  await page.waitForSelector('#style-buttons button', { state: 'attached' });
  return page;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  // 1. picking a style is free; a double click on Create starts exactly one song
  {
    const page = await open(browser, {});
    const chip = (n) => page.locator('#style-buttons button', { hasText: n });
    await chip('Pop').click();
    await page.waitForTimeout(100);
    check('clicking a style alone starts nothing', (await sent(page, 'createSong')) === 0);
    check('the style is selected', (await chip('Pop').getAttribute('aria-checked')) === 'true' && (await chip('Musical').getAttribute('aria-checked')) === 'false');
    check('Create names the selected style', (await page.textContent('#create-btn')).trim() === 'Create Pop song', await page.textContent('#create-btn'));
    // Fire a double-click plus a style change synchronously in the page, then inspect
    // the DOM in the same tick (browser-driver clicks add latency that hides the race we care about).
    const snap = await page.evaluate(() => {
      const find = n => [...document.querySelectorAll('#style-buttons button')].find(b => b.textContent === n);
      const create = document.getElementById('create-btn');
      find('Musical').click(); create.click(); create.click(); find('Pop').click(); create.click();
      return {
        label: create.textContent.trim(),
        enabled: document.querySelectorAll('#create-section button:not([disabled])').length,
        pending: !!document.getElementById('pending-card'),
        popChecked: find('Pop').getAttribute('aria-checked')
      };
    });
    check('button reacts immediately ("Starting...")', snap.label === 'Starting...', snap.label);
    check('all create controls disabled while starting', snap.enabled === 0, String(snap.enabled));
    check('the style cannot change while starting', snap.popChecked === 'false');
    check('placeholder card shown at once', snap.pending);
    await page.waitForSelector('#pending-card', { state: 'detached' });
    check('exactly one createSong was sent', (await sent(page, 'createSong')) === 1, String(await sent(page, 'createSong')));
    check('exactly one real card afterwards', (await page.locator('#active-requests .request-card').count()) === 1);
    check('success message shown', /Started a "Musical" song/.test(await page.textContent('#error-banner')));
    check('buttons re-enabled afterwards', await page.locator('#create-section button[disabled]').count() === 0);
    check('style picker folds away while a song is being made', await page.locator('#create-section.collapsed').count() === 1 && !(await chip('Pop').isVisible()));
    await page.click('#toggle-styles-btn');
    check('"Change style" opens the picker again', await chip('Pop').isVisible());
    await page.close();
  }

  // 2. cancel works even when a tick re-renders mid-click, and card DOM is stable
  {
    const page = await open(browser, { requests: [{ id: 'a1', status: 'LYRICS', articleTitle: 'Slow one', songStyle: { name: 'Informative' }, lyricsProvider: 'anthropic' }] });
    await page.waitForSelector('.request-card');
    const before = await page.evaluateHandle(() => document.querySelector('.request-card'));
    await page.waitForTimeout(2500); // > 2 render ticks
    const same = await page.evaluate(([a]) => a === document.querySelector('.request-card'), [before]);
    check('card DOM node survives re-render ticks', same);
    const timeBefore = await page.textContent('.js-time');
    await page.waitForTimeout(1200);
    check('elapsed timer still updates live', timeBefore !== (await page.textContent('.js-time')));

    const cancel = page.locator('.request-card button', { hasText: 'Cancel' });
    const box = await cancel.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.waitForTimeout(1300); // a render tick lands between mousedown and mouseup
    await page.mouse.up();
    await page.waitForFunction(() => window.__sent.includes('cancelRequest'), null, { timeout: 2000 }).catch(() => {});
    check('Cancel click registers across a render tick', (await sent(page, 'cancelRequest')) === 1);
    await page.waitForTimeout(300);
    check('cancelled card leaves Active', await page.locator('#active-requests .request-card').count() === 0);
    check('cancelled card is in history with Remove', await page.locator('#history-requests .request-card button', { hasText: 'Remove' }).count() === 1);
    await page.locator('#history-requests button', { hasText: 'Remove' }).click();
    await page.waitForTimeout(200);
    check('Remove removes the card', await page.locator('.request-card').count() === 0);
    await page.close();
  }

  // 3. failure keeps custom text and re-enables
  {
    const page = await open(browser, { failCreate: true, createDelay: 200 });
    await page.locator('#style-buttons button', { hasText: 'Custom' }).click();
    await page.click('#create-btn');
    check('empty custom style is caught before anything is sent', (await sent(page, 'createSong')) === 0 && /Describe the style/.test(await page.textContent('#error-banner')));
    await page.fill('#custom-style-input', 'sea shanty');
    await page.click('#create-btn');
    await page.waitForSelector('#pending-card', { state: 'detached' });
    check('error shown on failure', /Boom/.test(await page.textContent('#error-banner')));
    check('custom text kept after failure', (await page.inputValue('#custom-style-input')) === 'sea shanty');
    check('controls usable again after failure', await page.locator('#create-btn[disabled]').count() === 0);
    await page.close();
  }

  // 4. money: balance under Create, out-of-credits failures point to a top-up instead of a doomed retry
  {
    const page = await open(browser, { credits: 1240 });
    await page.waitForTimeout(200);
    check('credit balance shown', /1,240 left/.test(await page.textContent('#credits-line')), await page.textContent('#credits-line'));
    await page.close();
  }
  {
    const page = await open(browser, { credits: 0, requests: [
      { id: 'f1', status: 'FAILED', articleTitle: 'Rates', songStyle: { name: 'Meme' }, error: 'Suno API error 429: insufficient SunoAPI credits' },
      { id: 'c1', status: 'COMPLETE', articleTitle: 'Bees', title: 'Dance of the Hive', songStyle: { name: 'Pop' }, lyrics: 'la la' }
    ] });
    await page.waitForTimeout(200);
    check('zero balance is called out', /out of SunoAPI credits/.test(await page.textContent('#credits-line')));
    const failed = page.locator('#history-requests [data-request-id="f1"]');
    check('credit failure explained in plain words', /out of SunoAPI credits/.test(await failed.textContent()) && !/429/.test(await failed.locator('.error-message').textContent()));
    check('Add credits is the main action, Try again second', (await failed.locator('.btn').first().textContent()).includes('Add credits') && await failed.locator('.btn', { hasText: 'Try again' }).count() === 1);
    const done = page.locator('#history-requests [data-request-id="c1"]');
    check('finished song shows its song title and the article it came from', /Dance of the Hive/.test(await done.textContent()) && /from Bees/.test(await done.textContent()));
    check('Play is the main action of a finished song', await done.locator('.btn-primary', { hasText: 'Play' }).count() === 1);
    await done.locator('[aria-label="More actions"]').click();
    check('the ⋯ menu offers download, copy and remove', /Download/.test(await done.locator('.menu').textContent()) && /Copy lyrics/.test(await done.locator('.menu').textContent()) && /Remove/.test(await done.locator('.menu').textContent()));
    await page.keyboard.press('Escape');
    check('Escape closes the menu', await page.locator('.menu').count() === 0);
    await page.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();

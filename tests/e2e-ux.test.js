// End-to-end UX test: the REAL popup (popup.html/popup.js in Chrome) wired to the REAL background
// scripts (in a Node vm) with a fake network. Covers queueing, reordering, cancelling, Play Again.
// Usage: node tests/e2e-ux.test.js [screenshotDir]   (needs playwright-core and Google Chrome)
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const path = require('path');
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();
const shots = process.argv[2];
const popupUrl = 'file://' + (process.env.POPUP_HTML || path.resolve(__dirname, '../add-on/popup.html'));

const stub = `
  window.__listeners = [];
  window.__delays = {};
  window.__tab = { id: 1, url: 'https://example.com/diesel', title: 'The Diesel Weapon - by Ed Conway' };
  window.browser = {
    storage: { sync: { get: async () => ({ suno_api_key: 'x'.repeat(20) }), set: async () => {} }, local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
    tabs: { query: async () => [window.__tab], create: async () => {} },
    runtime: { openOptionsPage() {}, onMessage: { addListener: f => window.__listeners.push(f) }, sendMessage: async m => { const r = await window.__bg(m); const d = (window.__delays[m.action] || []).shift(); if (d) await new Promise(res => setTimeout(res, d)); return r; } }
  };`;

async function openPopup(browser, env) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', e => check('no page errors', false, e.message));
  await page.exposeFunction('__bg', msg => env.send(msg));
  env.onBroadcast = msg => page.evaluate(m => window.__listeners.forEach(f => f(m)), msg).catch(() => {});
  await page.addInitScript(stub);
  await page.goto(popupUrl);
  await page.waitForSelector('#style-buttons button', { state: 'attached' });
  return page;
}

// Pick a style and press Create the way a fast user would (in-page clicks), then wait for the popup to settle.
async function start(page, styleName) {
  await page.evaluate(n => {
    [...document.querySelectorAll('#style-buttons button')].find(b => b.textContent === n).click();
    document.getElementById('create-btn').click();
  }, styleName);
  await page.waitForSelector('#pending-card', { state: 'detached' });
}
const styleOf = r => r.songStyle.name;
const queueStyles = page => page.$$eval('#queue-requests .queue-sub', els => els.map(e => e.textContent.replace('Starts next', '').trim()));
const bgQueue = env => env.requests().filter(r => r.status === 'QUEUED').sort((a, b) => a.queuePos - b.queuePos).map(styleOf);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `ux-${name}.png`) }); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const env = makeEnv();
  env.hold = true; // freeze generation so we can look at the queue
  await env.settle(30);
  const page = await openPopup(browser, env);

  // --- queueing
  await start(page, 'Musical');
  check('first song becomes an active card', await page.locator('#active-requests .request-card').count() === 1);
  check('no queue section for a single song', !(await page.locator('#queue-section').isVisible()));

  await start(page, 'Pop');
  check('second song appears in "Up next"', await page.locator('#queue-section').isVisible() && await page.locator('.queue-row').count() === 1);
  check('queued confirmation message', /Added to the queue: #1/.test(await page.textContent('#error-banner')), await page.textContent('#error-banner'));
  check('first queued row is marked "Starts next"', (await page.textContent('.queue-row')).includes('Starts next'));
  check('newly queued row is highlighted', await page.locator('.queue-row.just-added').count() === 1);

  await start(page, 'Meme'); await start(page, 'Cute'); await start(page, 'Informative');
  check('rows are numbered in order', eq(await page.$$eval('.queue-num', e => e.map(x => x.textContent)), ['1', '2', '3', '4']));
  check('queue order matches background', eq(await queueStyles(page), ['Pop', 'Meme', 'Cute', 'Informative']) && eq(bgQueue(env), ['Pop', 'Meme', 'Cute', 'Informative']), JSON.stringify([await queueStyles(page), bgQueue(env)]));
  check('queue badge shows 4', (await page.textContent('#queue-count')) === '4');
  check('first row cannot move up, last cannot move down', await page.locator('.queue-row').first().locator('.up').isDisabled() && await page.locator('.queue-row').last().locator('.down').isDisabled());
  await start(page, 'Meme');
  check('re-clicking a queued style is rejected with a message', /already being generated/.test(await page.textContent('#error-banner')) && (await queueStyles(page)).length === 4);
  await shot(page, 'queue-4');

  // --- reorder with buttons
  await page.locator('.queue-row').nth(3).locator('.up').click();
  await page.waitForTimeout(100);
  check('Move up swaps rows in the UI and background', eq(await queueStyles(page), ['Pop', 'Meme', 'Informative', 'Cute']) && eq(bgQueue(env), ['Pop', 'Meme', 'Informative', 'Cute']), JSON.stringify([await queueStyles(page), bgQueue(env)]));
  await page.locator('.queue-row').nth(0).locator('.down').click();
  await page.waitForTimeout(100);
  check('Move down swaps rows', eq(await queueStyles(page), ['Meme', 'Pop', 'Informative', 'Cute']));
  check('"Starts next" follows the new first row', (await page.locator('.queue-row').first().textContent()).includes('Starts next') && !(await page.locator('.queue-row').nth(1).textContent()).includes('Starts next'));

  // --- reorder by drag and drop
  const rows = page.locator('.queue-row');
  await rows.nth(3).dragTo(rows.nth(0), { targetPosition: { x: 150, y: 3 } }); // drop on top half of row 0
  await page.waitForTimeout(150);
  check('dragging the last row to the top reorders it', eq(await queueStyles(page), ['Cute', 'Meme', 'Pop', 'Informative']) && eq(bgQueue(env), ['Cute', 'Meme', 'Pop', 'Informative']), JSON.stringify([await queueStyles(page), bgQueue(env)]));
  await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 150, y: 30 } }); // bottom half of row 2 -> after it
  await page.waitForTimeout(150);
  check('dragging down drops after the target', eq(await queueStyles(page), ['Meme', 'Pop', 'Cute', 'Informative']), JSON.stringify(await queueStyles(page)));
  check('indicators cleaned up after drag', await page.locator('.dragging, .drop-before, .drop-after').count() === 0);
  await shot(page, 'queue-reordered');

  // --- remove from queue
  await page.locator('.queue-row').nth(1).locator('.remove').click();
  await page.waitForTimeout(150);
  check('removing a queued song drops the row', eq(await queueStyles(page), ['Meme', 'Cute', 'Informative']));
  check('removed song is CANCELLED in history, not run', env.requests().find(r => styleOf(r) === 'Pop').status === 'CANCELLED' && await page.locator('#history-requests .request-card').count() === 1);

  // --- generation proceeds in the visible order
  env.releaseAll();
  await page.waitForFunction(() => document.querySelectorAll('#queue-requests .queue-row').length === 0, null, { timeout: 4000 });
  await env.settle(300);
  const order = env.requests().filter(r => r.timestamps.started).sort((a, b) => a.timestamps.started - b.timestamps.started).map(styleOf);
  check('start order = Musical, then the rearranged queue', eq(order, ['Musical', 'Meme', 'Cute', 'Informative']), JSON.stringify(order));
  check('queue section hides when empty', !(await page.locator('#queue-section').isVisible()));
  check('player widget shows the playing song', await page.locator('#now-playing').isVisible());
  await shot(page, 'after-run');

  // --- finished songs wait in the play queue; "Play now" jumps one to the front
  check('finished songs wait in "Up next to play"', await page.locator('#play-queue-requests .queue-row').count() === 3 && await page.locator('#play-queue-section').isVisible());
  const readyRow = page.locator('#play-queue-requests .queue-row').nth(1);
  const readyId = await readyRow.getAttribute('data-request-id');
  await readyRow.locator('.play-now').click();
  await page.waitForTimeout(400);
  check('Play now starts that song and stops the other', env.requests().find(r => r.id === readyId).status === 'PLAYING' && env.requests().filter(r => r.status === 'PLAYING').length === 1);
  check('played song left the play queue', await page.locator('#play-queue-requests .queue-row').count() === 2);
  check('player widget follows', await page.locator('#now-playing').isVisible());
  const stopped = env.requests().find(r => r.status === 'COMPLETE' && r.playQueuePos == null && r.id !== readyId);
  check('the interrupted song is in history with Play', await page.locator(`#history-requests [data-request-id="${stopped.id}"] .btn:has-text("Play")`).count() === 1);

  // --- cancelling the running song promotes the queue
  const env2 = makeEnv(); env2.hold = true; await env2.settle(30);
  const page2 = await openPopup(browser, env2);
  await start(page2, 'Musical'); await start(page2, 'Pop'); await start(page2, 'Meme');
  await page2.locator('#active-requests .btn:has-text("Cancel")').click();
  await page2.waitForTimeout(200);
  check('cancelling the running song starts the next queued one', eq(await queueStyles(page2), ['Meme']) && await page2.locator('#active-requests .request-card').count() === 1, JSON.stringify(await queueStyles(page2)));
  check('active card is now the promoted song', (await page2.textContent('#active-requests .style-tag')) === 'Pop');

  // --- clear queue needs a second click
  await page2.click('#clear-queue-btn');
  check('Cancel all arms first', (await page2.textContent('#clear-queue-btn')) === 'Click again to cancel all' && await page2.locator('.queue-row').count() === 1);
  await page2.click('#clear-queue-btn');
  await page2.waitForTimeout(150);
  check('second click clears the queue', await page2.locator('.queue-row').count() === 0 && !(await page2.locator('#queue-section').isVisible()));


  // =====================================================================================
  // Flaky controls: stale replies, stuck slider, transient errors, rapid clicks
  // =====================================================================================
  {
    const env3 = makeEnv(); await env3.settle(30);
    const page3 = await openPopup(browser, env3);
    await start(page3, 'Musical');
    await page3.waitForSelector('#now-playing', { state: 'visible', timeout: 4000 });
    const label = () => page3.getAttribute('#play-pause-btn', 'aria-label');
    const songId = () => env3.requests().find(r => r.status === 'PLAYING').id;
    await page3.waitForTimeout(700);
    check('player starts in "Pause" state', (await label()) === 'Pause');

    // 1. A status reply that was already in flight must not undo a button press
    env3.tabLatency = 300;
    await page3.evaluate(() => {
      window.__labels = [];
      new MutationObserver(() => window.__labels.push(document.getElementById('play-pause-btn').getAttribute('aria-label')))
        .observe(document.getElementById('play-pause-btn'), { attributes: true, attributeFilter: ['aria-label'] });
      pollPlayback(); document.getElementById('play-pause-btn').click();
    });
    await page3.waitForTimeout(1200);
    const labels = await page3.evaluate(() => window.__labels);
    check('pause sticks even when a stale status reply lands afterwards', env3.tabState.paused === true && (await label()) === 'Play' && !labels.includes('Pause'), JSON.stringify([env3.tabState.paused, labels]));
    env3.tabLatency = 0;
    await page3.click('#play-pause-btn');
    await page3.waitForTimeout(800);
    check('resume works', env3.tabState.paused === false && (await label()) === 'Pause');

    // 2. Rapid clicking ends in a consistent state (UI == audio)
    await page3.evaluate(() => { const b = document.getElementById('play-pause-btn'); for (let i = 0; i < 5; i++) b.click(); });
    await page3.waitForTimeout(1000);
    const uiPlaying = (await label()) === 'Pause';
    check('5 rapid clicks: UI matches the audio state', uiPlaying === !env3.tabState.paused, JSON.stringify([uiPlaying, env3.tabState.paused]));
    check('5 rapid clicks: odd number of toggles flipped it', env3.tabState.paused === true);
    if (env3.tabState.paused) { await page3.click('#play-pause-btn'); await page3.waitForTimeout(500); }

    // 3. Seek slider: drag away and back (an input event but no change event) must not freeze the progress display
    await page3.evaluate(() => { document.getElementById('player-seek').dispatchEvent(new Event('input', { bubbles: true })); });
    const sBox = await page3.locator('#player-seek').boundingBox();
    const sVal = Number(await page3.inputValue('#player-seek'));
    const thumbX = sBox.x + 6 + (sBox.width - 12) * (sVal / 1000);
    await page3.mouse.move(thumbX, sBox.y + sBox.height / 2); await page3.mouse.down(); await page3.mouse.up();
    const t0 = await page3.textContent('#player-current');
    await page3.waitForTimeout(2200);
    check('progress keeps updating after a drag that ends where it began', (await page3.textContent('#player-current')) !== t0, t0);

    // 4. Skip buttons move the position
    const before = env3.tabState.currentTime;
    await page3.click('#fwd-btn'); await page3.waitForTimeout(200);
    check('+10s skip reaches the player', env3.tabState.currentTime >= before + 9, JSON.stringify([before, env3.tabState.currentTime]));
    await page3.click('#back-btn'); await page3.waitForTimeout(200);
    check('-10s skip reaches the player', env3.tabState.currentTime < before + 9);

    // 5. One failed status check (busy tab, navigation blip) must not stop the song
    const playingId = songId();
    env3.failStatus = 1;
    await page3.evaluate(() => pollPlayback());
    await page3.waitForTimeout(300);
    check('a single failed status check does not stop playback', env3.requests().find(r => r.id === playingId).status === 'PLAYING' && await page3.locator('#now-playing').isVisible());

    // 6. A stale getRequests snapshot must not resurrect old state
    const env4 = makeEnv(); env4.hold = true; await env4.settle(30);
    const page4 = await openPopup(browser, env4);
    await start(page4, 'Musical');
    await page4.evaluate(() => { window.__delays.getRequests = [500]; window.__stale = loadData().then(() => renderUI()); });
    await page4.waitForTimeout(50);
    await page4.locator('#active-requests .btn:has-text("Cancel")').click();
    await page4.waitForTimeout(900); // the slow, stale snapshot (still "generating") arrives in the meantime
    check('late stale snapshot does not bring the cancelled card back', await page4.locator('#active-requests .request-card').count() === 0 && await page4.locator('#history-requests .request-card').count() === 1, JSON.stringify([await page4.locator('#active-requests .request-card').count(), await page4.locator('#history-requests .request-card').count()]));
  }

  // =====================================================================================
  // Play queue UI: finished songs wait in order, auto-advance, reorder, skip, remove
  // =====================================================================================
  {
    const env5 = makeEnv(); await env5.settle(30);
    const page5 = await openPopup(browser, env5);
    await start(page5, 'Musical');
    await page5.waitForSelector('#now-playing', { state: 'visible', timeout: 4000 });
    await start(page5, 'Pop'); await start(page5, 'Meme'); await start(page5, 'Cute');
    await page5.waitForFunction(() => document.querySelectorAll('#play-queue-requests .queue-row').length === 3, null, { timeout: 5000 });
    const playStyles = () => page5.$$eval('#play-queue-requests .queue-sub', els => els.map(e => e.textContent.replace('Plays next', '').split('\u00b7')[0].trim()));
    const playOrderBg = () => env5.requests().filter(r => r.playQueuePos != null).sort((a, b) => a.playQueuePos - b.playQueuePos).map(r => r.songStyle.name);
    const nowPlayingStyle = () => env5.requests().find(r => r.status === 'PLAYING').songStyle.name;

    check('Pop, Meme, Cute wait to play, in finish order', eq(await playStyles(), ['Pop', 'Meme', 'Cute']) && nowPlayingStyle() === 'Musical', JSON.stringify(await playStyles()));
    check('rows show the song length', /1:40/.test(await page5.textContent('#play-queue-requests .queue-row')));
    check('first row is marked "Plays next"', (await page5.textContent('#play-queue-requests .queue-row')).includes('Plays next'));
    check('play queue badge shows 3', (await page5.textContent('#play-queue-count')) === '3');
    check('player widget names the next song and enables Next', /Up next:/.test(await page5.textContent('#player-upnext')) && await page5.locator('#next-btn').isEnabled());
    check('nothing is in the generation queue', !(await page5.locator('#queue-section').isVisible()));
    await shot(page5, 'play-queue');

    await page5.locator('#play-queue-requests .queue-row').first().locator('.down').click();
    await page5.waitForTimeout(150);
    check('Move down reorders the play queue (UI and background)', eq(await playStyles(), ['Meme', 'Pop', 'Cute']) && eq(playOrderBg(), ['Meme', 'Pop', 'Cute']), JSON.stringify([await playStyles(), playOrderBg()]));
    const prow = page5.locator('#play-queue-requests .queue-row');
    await prow.nth(2).dragTo(prow.nth(0), { targetPosition: { x: 150, y: 3 } });
    await page5.waitForTimeout(200);
    check('dragging reorders the play queue', eq(await playStyles(), ['Cute', 'Meme', 'Pop']) && eq(playOrderBg(), ['Cute', 'Meme', 'Pop']), JSON.stringify([await playStyles(), playOrderBg()]));

    // both queues at once
    env5.hold = true;
    await start(page5, 'Informative'); await start(page5, 'Spoken');
    check('generation queue and play queue are shown together', await page5.locator('#queue-section').isVisible() && await page5.locator('#play-queue-section').isVisible());
    check('they have distinct headings', /Up next to play/.test(await page5.textContent('#play-queue-section')) && /Waiting to generate/.test(await page5.textContent('#queue-section')));
    await shot(page5, 'both-queues');
    await page5.locator('#queue-requests .queue-row').first().locator('.remove').click(); // cancel waiting one
    await page5.locator('#active-requests .btn:has-text("Cancel")').click();
    await page5.waitForTimeout(200);
    env5.releaseAll();

    // remove from play queue
    await page5.locator('#play-queue-requests .queue-row').nth(1).locator('.remove').click();
    await page5.waitForTimeout(150);
    check('removing takes a song out of the play queue only', eq(await playStyles(), ['Cute', 'Pop']) && await page5.locator('#history-requests .btn:has-text("Play")').count() >= 1, JSON.stringify(await playStyles()));

    // the playing song ends by itself -> next one starts
    await env5.send({ action: 'audioEnded', requestId: env5.requests().find(r => r.status === 'PLAYING').id });
    await page5.waitForTimeout(400);
    check('auto-advance: the first queued song is now playing', nowPlayingStyle() === 'Cute' && eq(await playStyles(), ['Pop']), JSON.stringify([nowPlayingStyle(), await playStyles()]));
    check('auto-advance: widget still visible', await page5.locator('#now-playing').isVisible());

    // skip with Next
    await page5.click('#next-btn');
    await page5.waitForTimeout(400);
    check('Next starts the following song and drains the queue', nowPlayingStyle() === 'Pop' && !(await page5.locator('#play-queue-section').isVisible()), JSON.stringify([nowPlayingStyle()]));
    check('Next is disabled when the queue is empty', await page5.locator('#next-btn').isDisabled() && (await page5.textContent('#player-upnext')) === '');

    // clear needs a second click
    await start(page5, 'Informative');
    await page5.waitForFunction(() => document.querySelectorAll('#play-queue-requests .queue-row').length >= 1, null, { timeout: 5000 });
    await page5.click('#clear-play-queue-btn');
    check('Clear arms first', (await page5.textContent('#clear-play-queue-btn')) === 'Click again to clear' && await page5.locator('#play-queue-requests .queue-row').count() >= 1);
    await page5.click('#clear-play-queue-btn');
    await page5.waitForTimeout(200);
    check('second click clears the play queue', await page5.locator('#play-queue-requests .queue-row').count() === 0);
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(1); });

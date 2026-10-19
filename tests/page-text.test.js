// Where a song's text comes from: the top frame, an article inside an iframe (Hugging Face Spaces),
// text the popup already has, the highlighted selection in any frame, and the selection context menu.
// Usage: node tests/page-text.test.js
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();

const ARTICLE = 'The training playbook explains how small models learn from carefully curated data. '.repeat(20);
const SHELL = 'Fetching metadata from the HF Docker repository...';

(async () => {
  // 1. Hugging Face Space: the top frame is a 50-character shell; the article is in a cross-origin iframe
  {
    const env = makeEnv(); env.hold = true;
    env.pageText = SHELL;
    env.frames = [{ text: SHELL }, { text: 'Subset (1) default · 36 rows' }, { text: ARTICLE }, { text: '' }];
    const r = await env.create('Space');
    const req = env.byTitle('Space');
    check('article inside an iframe is found', r.success && req && req.articleText === ARTICLE, JSON.stringify(r));
  }

  // 2. A page with its own article keeps it, even when an iframe (comments, say) holds more text
  {
    const env = makeEnv(); env.hold = true;
    env.pageText = ARTICLE;
    env.frames = [{ text: ARTICLE }, { text: 'A long comment thread. '.repeat(500) }];
    await env.create('Blog');
    check('top-frame article wins over a longer iframe', env.byTitle('Blog').articleText === ARTICLE);
  }

  // 3. Nothing anywhere: fail loudly, and say how to use a selection instead
  {
    const env = makeEnv();
    env.pageText = SHELL;
    env.frames = [{ text: SHELL }, { text: '' }];
    const r = await env.create('Empty');
    check('empty shell: clear error', !r.success && r.error.includes(`only ${SHELL.length} characters`), r.error);
    check('error points to the selection menu', /right-click/.test(r.error) && r.error.includes('Make a song from the selection'), r.error);
  }

  // 4. A whole book of a page is capped, like PDFs
  {
    const env = makeEnv(); env.hold = true;
    env.pageText = 'word '.repeat(50000);
    await env.create('Huge');
    check('article text capped at 100k characters', env.byTitle('Huge').articleText.length === 100000, String(env.byTitle('Huge').articleText.length));
  }

  // 5. Text the sender already has (highlighted passage, picked PDF file) is used without reading the tab
  {
    const env = makeEnv(); env.hold = true;
    env.tabMode = 'none'; // reading the tab would fail
    const r = await env.create('Picked', 'musical', { text: 'Only this passage about bees.' });
    check('provided text becomes the song text', r.success && env.byTitle('Picked').articleText === 'Only this passage about bees.', JSON.stringify(r));
    const again = await env.create('Picked', 'musical', { text: 'Only this passage about bees.' });
    check('same text + style is a duplicate', again.duplicate === true, JSON.stringify(again));
  }

  // 6. A selection in any frame is seen (the content script only lives in the top frame)
  {
    const env = makeEnv();
    env.frames = [{ selection: '' }, { selection: 'Highlighted inside the iframe' }, { selection: 'short' }];
    const r = await env.send({ action: 'getSelection', tabId: 1, tabUrl: 'https://x.org/a' });
    check('selection inside an iframe is found', r.text === 'Highlighted inside the iframe', JSON.stringify(r));
  }

  // 7. Firefox's PDF viewer can't be scripted: the selection arrives through the context menu, once
  {
    const env = makeEnv();
    env.tabMode = 'none';
    check('selection context menu item exists', env.menuItems.some(i => i.id === 'song-from-selection' && i.contexts.includes('selection')));
    const tab = { id: 4, url: 'https://x.org/paper.pdf' };
    env.menuClick({ menuItemId: 'song-from-selection', selectionText: '  Abstract: honeybees navigate by the sun.  ' }, tab);
    check('menu click opens the popup', env.popupsOpened === 1);
    const other = await env.send({ action: 'getSelection', tabId: 5, tabUrl: 'https://x.org/other' });
    check('another tab does not get it', other.text === '', JSON.stringify(other));
    const r = await env.send({ action: 'getSelection', tabId: 4, tabUrl: tab.url });
    check('the popup gets the menu selection', r.text === 'Abstract: honeybees navigate by the sun.', JSON.stringify(r));
    const again = await env.send({ action: 'getSelection', tabId: 4, tabUrl: tab.url });
    check('it is used once', again.text === '', JSON.stringify(again));
  }

  done();
})();

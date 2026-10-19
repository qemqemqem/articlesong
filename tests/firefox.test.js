// The add-on in real (headless) Firefox, for what only Firefox can tell us: reading an article that lives in
// a cross-origin iframe (Hugging Face Spaces), seeing a selection inside one, reading a local PDF the user
// picks (Firefox won't let add-ons fetch file:// URLs), and the selection context menu inside Firefox's PDF
// viewer, where the add-on can't run scripts. Nothing here calls a paid API.
// Usage: node tests/firefox.test.js   (needs firefox + geckodriver)
const fs = require('fs'), path = require('path'), http = require('http');
const { launchFirefox } = require('./helpers/firefox');
const { makePdf } = require('./helpers/pdf-fixture');
const { runner } = require('./helpers/background-env');
const { check, done } = runner();

const ARTICLE = 'Small models learn the most from carefully filtered training data and a long, stable schedule. ';
const pages = {
  // Like huggingface.co/spaces/...: a bare shell whose only content is a cross-origin iframe
  '/space': port => `<html><head><title>Playbook - a Hugging Face Space</title></head><body>
    <header>Spaces · HuggingFaceTB</header>
    <iframe src="http://localhost:${port}/article" style="width:100%;height:600px"></iframe>
    <iframe src="about:blank"></iframe></body></html>`,
  '/article': () => `<html><head><title>The Playbook</title></head><body><nav><a href="#">Intro</a></nav>
    <article><h1>The Smol Training Playbook</h1>${`<p>${ARTICLE.repeat(4)}</p>`.repeat(8)}<p id="pick">Highlight this sentence about learning rates.</p></article></body></html>`
};

(async () => {
  const pdf = makePdf('Honeybees dance to tell each other where the flowers are.');
  const server = http.createServer((req, res) => {
    if (req.url === '/paper.pdf') { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end(pdf); return; }
    const page = pages[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html' });
    res.end(page ? page(server.address().port) : 'not found');
  }).listen(0);
  const port = server.address().port;
  // Snap Firefox can't see /tmp, so the "local" PDF lives under the repo
  const tmp = fs.mkdtempSync(path.join(__dirname, '.tmp-'));
  const pdfPath = path.join(tmp, 'smol playbook.pdf');
  fs.writeFileSync(pdfPath, pdf);

  const ff = await launchFirefox();
  try {
    // An extension page to talk to the add-on from, like the popup does
    const pageTab = await ff.currentTab();
    await ff.navigate(`http://127.0.0.1:${port}/space`);
    const extTab = await ff.openExtensionPage('debug.html');
    // Runs fn(backgroundWindow, allTabs, ...args) from that page
    const inAddon = (fn, ...args) => ff.run(`async (...a) => {
      const bg = await browser.runtime.getBackgroundPage();
      return (${fn})(bg, await browser.tabs.query({}), ...a);
    }`, ...args);

    // 1. The article in the cross-origin iframe is read, and reading the same page again still works
    const spaceTab = await inAddon((bg, tabs) => tabs.find(t => t.url.endsWith('/space')));
    for (const attempt of ['first', 'second']) {
      const text = await inAddon((bg, tabs, tab) => bg.getArticleText(tab.id, tab.url).catch(e => 'ERR ' + e.message), spaceTab);
      check(`${attempt} read: article found inside the iframe`, text.includes('The Smol Training Playbook') && text.includes('carefully filtered'), text.slice(0, 200));
    }

    // 2. A selection inside the iframe reaches the popup's getSelection
    await ff.switchTo(pageTab);
    await ff.switchToFrame(0);
    await ff.run(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('pick')); getSelection().addRange(r); });
    await ff.switchToTopFrame();
    await ff.switchTo(extTab);
    const sel = await ff.run((tab) => browser.runtime.sendMessage({ action: 'getSelection', tabId: tab.id, tabUrl: tab.url }), spaceTab);
    check('selection inside the iframe is seen', sel.text === 'Highlight this sentence about learning rates.', JSON.stringify(sel));

    // 3. A local PDF: the background can't fetch it...
    await ff.switchTo(pageTab);
    const fileUrl = 'file://' + pdfPath.split('/').map(encodeURIComponent).join('/');
    await ff.navigate(fileUrl);
    await ff.switchTo(extTab);
    const pdfTab = await inAddon((bg, tabs) => tabs.find(t => t.url.startsWith('file:')));
    const direct = await inAddon((bg, tabs, tab) => bg.getArticleText(tab.id, tab.url).then(() => 'read it?!', e => e.message), pdfTab);
    check('background still cannot read a file:// PDF, and says what to do', /Press Create in the ArticleSong popup to pick the file/.test(direct), direct);

    // ...but the picker page reads the file the user chooses and starts the song with the popup's style
    await inAddon(bg => { bg.pumpQueue = () => {}; }); // keep the song queued: no API calls
    const params = new URLSearchParams({ tabId: pdfTab.id, url: pdfTab.url, title: 'Smol Playbook', style: JSON.stringify({ id: 'informative', name: 'Informative' }) });
    await ff.openExtensionPage(`open-pdf.html?${params}`);
    check('picker names the file and the style', await ff.run(() => document.querySelector('.lede').textContent.replace(/\s+/g, ' ')).then(t => /choose smol playbook\.pdf here/.test(t) && /Informative song/.test(t)));
    await ff.sendKeys(await ff.find('#file-input'), pdfPath);
    let status = '';
    for (let i = 0; i < 50 && !/song|rror|Could/.test(status); i++) {
      await new Promise(r => setTimeout(r, 100));
      status = await ff.run(() => document.getElementById('status').textContent);
    }
    check('picker reports the song started', /your Informative song/.test(status) && !/rror|Could/.test(status), status);
    // getRequests leaves out the article text, so look the request up by id in the background
    const req = await inAddon(async bg => {
      const { requests } = await browser.runtime.sendMessage({ action: 'getRequests' });
      const found = requests.find(r => r.articleUrl.startsWith('file:'));
      return found ? JSON.parse(JSON.stringify(bg.getRequest(found.id))) : null;
    });
    check('song made from the picked PDF text', req && /Honeybees dance/.test(req.articleText), JSON.stringify(req && req.articleText));
    check('song keeps the PDF tab, title and chosen style', req && req.tabId === pdfTab.id && req.articleTitle === 'Smol Playbook' && req.songStyle.id === 'informative', JSON.stringify(req && [req.tabId, req.articleTitle, req.songStyle]));

    // 4. Firefox's PDF viewer: the popup can't see a selection there, so it goes right-click -> menu -> popup
    await ff.switchTo(pageTab);
    await ff.navigate(`http://127.0.0.1:${port}/paper.pdf`);
    let spot = null;
    for (let i = 0; i < 40 && !spot; i++) {
      await new Promise(r => setTimeout(r, 250));
      spot = await ff.run(() => {
        const span = [...document.querySelectorAll('.textLayer span')].find(s => /Honeybees/.test(s.textContent));
        if (!span) return null;
        const range = document.createRange();
        range.selectNodeContents(span);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        const box = span.getBoundingClientRect();
        return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
      });
    }
    check('PDF viewer rendered the text', !!spot);
    await ff.rightClick(spot.x, spot.y);
    await new Promise(r => setTimeout(r, 500));
    const item = await ff.inChrome(`
      const menu = document.getElementById('contentAreaContextMenu');
      const item = [...menu.querySelectorAll('menuitem')].find(i => i.id.endsWith('_song-from-selection'));
      if (!item || item.hidden || menu.state !== 'open') return null;
      menu.activateItem(item);
      return item.label;`);
    check('PDF viewer context menu offers "Make a song from the selection"', item === 'Make a song from the selection', String(item));
    // Moving WebDriver to another window while the popup is still opening would cancel it
    let popupOpen = false;
    for (let i = 0; i < 40 && !popupOpen; i++) {
      await new Promise(r => setTimeout(r, 100));
      popupOpen = await ff.inChrome(`return [...document.querySelectorAll('panel browser')]
        .some(b => b.currentURI && b.currentURI.spec.endsWith('/popup.html') && b.closest('panel').state === 'open');`);
    }
    check('the popup opens on the PDF\'s window', popupOpen);
    await ff.switchTo(extTab);
    let source = '';
    for (let i = 0; i < 40 && !/Highlighted/.test(source); i++) {
      await new Promise(r => setTimeout(r, 100));
      source = await ff.run(() => browser.extension.getViews({ type: 'popup' }).map(v => v.document.getElementById('source-line').textContent).join('|'));
    }
    check('the popup opens with the PDF selection as the source', /Highlighted · 10 words/.test(source), source);
  } catch (error) {
    check('firefox run', false, error.stack);
  } finally {
    await ff.quit();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  done();
})();

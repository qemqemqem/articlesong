// Article extraction (content_script.js + Readability) on fixture pages in real Chrome.
// Covers the "song about accepting cookies" bug: consent banners and shadow-DOM articles.
// Usage: node tests/extraction.test.js   (needs playwright-core and Google Chrome)
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const fs = require('fs'), path = require('path');
const addon = path.resolve(__dirname, '../add-on');
const readability = fs.readFileSync(path.join(addon, 'Readability.js'), 'utf8');
const articleExtract = fs.readFileSync(path.join(addon, 'article_extract.js'), 'utf8');
const contentScript = fs.readFileSync(path.join(addon, 'content_script.js'), 'utf8');
const { runner } = require('./helpers/background-env');
const { check, done } = runner();

const para = (n, topic) => Array.from({ length: n }, (_, i) =>
  `<p>Paragraph ${i + 1} about ${topic}: researchers measured decoder stability over several weeks, noting that calibration drift, electrode impedance and neural signal variance all affected the observed bits per second.</p>`).join('\n');
const BANNER = `<div class="cookiePopup" style="position:fixed;bottom:0"><p>Our website stores data in your browser to function. If you click Accept All, we will store additional data.</p><button>Accept All</button><button>Decline</button></div>`;

async function extract(browser, html) {
  const page = await browser.newPage();
  await page.setContent(html);
  await page.addScriptTag({ content: readability });
  await page.evaluate(() => { window.browser = { runtime: { onMessage: { addListener(f) { window.__l = f; } } } }; });
  await page.addScriptTag({ content: articleExtract });
  await page.addScriptTag({ content: contentScript });
  const text = await page.evaluate(() => new Promise(res => window.__l({ action: 'getText' }, {}, r => res(r.text))));
  await page.close();
  return text;
}
const hasBanner = t => /Accept All|stores data in your browser/.test(t);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });

  let t = await extract(browser, `<html><body>${BANNER}<nav><a>Home</a></nav><article><h1>Neural decoders</h1>${para(6, 'decoders')}</article></body></html>`);
  check('plain article: article text extracted', /decoder stability/.test(t) && t.length > 800, String(t.length));
  check('plain article: consent banner excluded', !hasBanner(t));

  // Article lives in a shadow root (neuralink.com does this); the light DOM holds only the banner + nav
  t = await extract(browser, `<html><body>${BANNER}<nav><a>Technology</a><a>Careers</a></nav><main><article id="host"></article></main>
    <script>document.getElementById('host').attachShadow({mode:'open'}).innerHTML = '<h1>Pretraining</h1>${para(6, 'pretraining').replace(/'/g, "\\'").replace(/\n/g, '')}';</script></body></html>`);
  check('shadow-DOM article: text found', /decoder stability/.test(t) && t.length > 800, String(t.length));
  check('shadow-DOM article: banner excluded', !hasBanner(t));

  // Declarative shadow DOM, as server-rendered (the same shape the live page has)
  t = await extract(browser, `<html><body>${BANNER}<main><article><template shadowrootmode="open"><h1>Pretraining</h1>${para(6, 'declarative')}</template></article></main></body></html>`);
  check('declarative shadow root: text found', /decoder stability/.test(t) && t.length > 800, String(t.length));

  // Nested shadow roots
  t = await extract(browser, `<html><body>${BANNER}<div id="outer"></div><script>
    const o = document.getElementById('outer').attachShadow({mode:'open'});
    o.innerHTML = '<section id="inner"></section>';
    o.getElementById('inner').attachShadow({mode:'open'}).innerHTML = '<article><h1>Nested</h1>${para(6, 'nesting').replace(/'/g, "\\'").replace(/\n/g, '')}</article>';
  </script></body></html>`);
  check('nested shadow roots: text found', /decoder stability/.test(t) && t.length > 800, String(t.length));

  // A large container that merely has "cookie" in its class must not be treated as a banner
  t = await extract(browser, `<html><body><div class="cookie-consent-page-wrapper"><article><h1>Real story</h1>${para(10, 'wrapper')}</article></div></body></html>`);
  check('big "cookie"-named wrapper is kept', /decoder stability/.test(t) && t.length > 1500, String(t.length));

  // Only a banner on the page: result must be tiny so the extension refuses to make a song
  t = await extract(browser, `<html><body>${BANNER}<nav><a>Home</a></nav></body></html>`);
  check('banner-only page yields (almost) nothing', t.trim().length < 100 && !hasBanner(t), JSON.stringify(t.trim()));

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(1); });

// PDF extraction test: serves a generated PDF over HTTP and runs the real pdf.js + PdfText code.
// Usage: node tests/pdf.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const { makePdf } = require('./helpers/pdf-fixture');


(async () => {
  const vendor = path.join(__dirname, '../add-on/vendor/pdfjs');
  const ctx = { structuredClone, ReadableStream, WritableStream, TransformStream, MessageChannel, Map, Set, WeakMap, Date, Math, JSON, console, fetch, URL, Uint8Array, TextDecoder, TextEncoder, setTimeout, clearTimeout, setInterval, clearInterval, Promise, navigator: {}, self: undefined };
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(vendor, 'pdf.min.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(vendor, 'pdf.worker.min.js'), 'utf8'), ctx); // fake-worker mode
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../add-on/pdf.js'), 'utf8') + ';this.PdfText=PdfText', ctx);

  const pdf = makePdf('Honeybees dance to tell each other where the flowers are.');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': req.url.startsWith('/html') ? 'text/html' : 'application/pdf' });
    res.end(req.url.startsWith('/html') ? '<p>hi</p>' : pdf);
  }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let fail = 0;
  const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) fail++; };

  try {
    const t = await ctx.PdfText.fromUrl(`${base}/paper.pdf`, { force: true });
    check('extracts text from .pdf url', /Honeybees dance/.test(t), JSON.stringify(t));
    const t2 = await ctx.PdfText.fromUrl(`${base}/download?id=7`);
    check('detects PDF by content-type', /flowers/.test(t2));
    check('non-PDF returns null', (await ctx.PdfText.fromUrl(`${base}/html`)) === null);
    check('looksLikePdfUrl', ctx.PdfText.looksLikePdfUrl('https://x.org/a/b.PDF?x=1') && !ctx.PdfText.looksLikePdfUrl('https://x.org/a'));
    let err; try { await ctx.PdfText.fromUrl('file:///tmp/a.pdf', { force: true }); } catch (e) { err = e; }
    check('file:// fails loudly', err && /file:\/\//.test(err.message));
  } catch (e) { check('pdf pipeline', false, e.stack); }
  server.close();
  process.exit(fail ? 1 : 0);
})();

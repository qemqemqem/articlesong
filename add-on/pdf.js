/**
 * Article Song - PDF text extraction
 *
 * Firefox's built-in PDF viewer doesn't run content scripts, so the background
 * page fetches the PDF itself and extracts text with the bundled pdf.js.
 */

const PdfText = {
  MAX_CHARS: 100000,

  looksLikePdfUrl(url) {
    try {
      return /\.pdf$/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  },

  /** Fetch `url`; return its bytes if it is a PDF, otherwise null. */
  async fetchPdfBytes(url, { force = false } = {}) {
    if (!/^https?:/i.test(url)) {
      throw new Error('Only http(s) PDFs can be read (local file:// PDFs are blocked by the browser). Select the text and use "selected text" instead.');
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download PDF: HTTP ${response.status}`);
    const isPdf = force || /application\/pdf/i.test(response.headers.get('content-type') || '');
    return isPdf ? new Uint8Array(await response.arrayBuffer()) : null;
  },

  /** Extract plain text from PDF bytes using a pdf.js library object. */
  async extractText(bytes, pdfjsLib = globalThis.pdfjsLib) {
    if (!pdfjsLib) throw new Error('pdf.js is not loaded');
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    let total = 0;
    for (let n = 1; n <= pdf.numPages && total < this.MAX_CHARS; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      const text = content.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim();
      pages.push(text);
      total += text.length;
    }
    const text = pages.join('\n\n').slice(0, this.MAX_CHARS).trim();
    if (!text) throw new Error('No text found in PDF (it may be a scanned image).');
    return text;
  },

  /** Returns extracted text if the tab is a PDF, otherwise null. */
  async fromUrl(url, { force = false } = {}) {
    const bytes = await this.fetchPdfBytes(url, { force });
    return bytes ? this.extractText(bytes) : null;
  }
};

if (typeof pdfjsLib !== 'undefined' && typeof browser !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('vendor/pdfjs/pdf.worker.min.js');
}

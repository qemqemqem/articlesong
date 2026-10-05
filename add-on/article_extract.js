// article_extract.js - article text extraction, shared by the add-on and the Android app.
//
// Pure functions of a Document (needs Readability.js loaded first). The Android app injects
// Readability.js + this file into a WebView and calls extractArticle(document), so keep this
// file free of extension APIs (no `browser.*`).

// Cookie / consent popups are short; a big container that merely has "cookie" in its class is not one.
const CONSENT_SELECTORS = [
  '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', 'dialog',
  '[class*="cookie" i]', '[id*="cookie" i]', '[class*="consent" i]', '[id*="consent" i]',
  '[class*="gdpr" i]', '[id*="gdpr" i]', '#onetrust-consent-sdk', '#CybotCookiebotDialog'
].join(',');
const MAX_CONSENT_BANNER_CHARS = 1500;

// document.cloneNode(true) drops shadow roots (and innerText never sees into them), so a page built from
// web components looks empty to Readability. Deep-clone, appending each open shadow root's children
// to its host so the text lands in the light DOM.
function cloneWithShadowDom(node) {
  const clone = node.cloneNode(false);
  if (node.nodeName === 'TEMPLATE') return clone; // inert template content is not rendered text
  node.childNodes.forEach(child => clone.appendChild(cloneWithShadowDom(child)));
  if (node.shadowRoot) {
    node.shadowRoot.childNodes.forEach(child => clone.appendChild(cloneWithShadowDom(child)));
  }
  return clone;
}

function removeConsentBanners(root) {
  root.querySelectorAll(CONSENT_SELECTORS).forEach(el => {
    if (el.isConnected && (el.textContent || '').length <= MAX_CONSENT_BANNER_CHARS) el.remove();
  });
}

// Returns { title, text, siteName } for the best-effort article in `doc`
function extractArticle(doc) {
  const documentClone = cloneWithShadowDom(doc);

  // Remove tables, info boxes and consent popups before parsing
  documentClone.querySelectorAll('table, .infobox, .info-box, .sidebar').forEach(el => el.remove());
  removeConsentBanners(documentClone);

  const reader = new Readability(documentClone, {
    classesToPreserve: [],
    removeNodes: ['aside', 'figure', 'figcaption'],
    disableJSONLD: true
  });

  const article = reader.parse();
  const title = (article && article.title) || doc.title || '';
  const siteName = (article && article.siteName) || '';
  if (article && article.textContent && article.textContent.trim().length > 0) {
    return { title, text: article.textContent, siteName };
  }
  // Readability found nothing: fall back to the cleaned body text
  return { title, text: (documentClone.body || documentClone).textContent || '', siteName };
}

// Pure function of a Document: returns the best-effort article text
function extractArticleText(doc) {
  return extractArticle(doc).text;
}

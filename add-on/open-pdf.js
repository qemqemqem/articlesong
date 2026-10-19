// Reads a PDF the user picks and starts its song. Firefox won't let add-ons fetch file:// URLs, but a file
// chosen in a file picker is readable. popup.js opens this page (?tabId=&url=&title=&style=) when Create is
// pressed on a local PDF; the user already chose the style and saw the cost there, so picking the file starts it.

const params = new URLSearchParams(location.search);
const pdfTabId = Number(params.get('tabId'));
const pdfUrl = params.get('url');
const pdfTitle = params.get('title');
const style = JSON.parse(params.get('style'));

const pdfPath = decodeURIComponent(new URL(pdfUrl).pathname);
const expectedName = pdfPath.split('/').pop();
const styleName = typeof style === 'object' ? style.name : 'custom';

document.getElementById('file-name').textContent = expectedName;
document.getElementById('style-name').textContent = `${styleName} song`;
document.getElementById('folder').textContent = `It's in ${pdfPath.slice(0, -expectedName.length) || '/'} (or drop it here)`;

function setStatus(text, kind = '') {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = `status ${kind}`;
}

async function start(file) {
  if (!file) return;
  const card = document.getElementById('card');
  card.classList.add('busy');
  setStatus(`Reading ${file.name}...`);
  try {
    const text = await PdfText.extractText(new Uint8Array(await file.arrayBuffer()));
    const response = await browser.runtime.sendMessage({
      action: 'createSong',
      songStyle: style,
      tabId: pdfTabId,
      // The tab title is the PDF's own title; a different file than the open one goes by its name
      tabTitle: file.name === expectedName && pdfTitle ? pdfTitle : file.name.replace(/\.pdf$/i, ''),
      tabUrl: pdfUrl,
      text
    });
    if (!response || !response.success) throw new Error((response && response.error) || 'Could not start the song');
    setStatus(response.queued
      ? `Added your ${styleName} song to the queue (#${response.position}). Follow it from the ArticleSong button.`
      : `Making your ${styleName} song. It takes about 3 minutes and plays when it's ready; follow it from the ArticleSong button.`, 'ok');
    document.getElementById('back-btn').hidden = false;
  } catch (error) {
    setStatus(error.message, 'error');
    card.classList.remove('busy');
  }
}

document.getElementById('file-input').addEventListener('change', e => start(e.target.files[0]));

// Drop anywhere on the page (a missed drop would otherwise make Firefox open the PDF in this tab)
const drop = document.getElementById('drop');
document.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
document.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('over');
  start(e.dataTransfer.files[0]);
});

document.getElementById('back-btn').addEventListener('click', async () => {
  await browser.tabs.update(pdfTabId, { active: true });
  await browser.tabs.remove((await browser.tabs.getCurrent()).id);
});

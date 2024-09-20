// content.js

console.log('Content script loaded.');

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getText') {
    console.log('Received request to get page text.');
    const text = document.body.innerText || '';
    sendResponse({ text });
    console.log('Sent page text to background script.');
  }
});

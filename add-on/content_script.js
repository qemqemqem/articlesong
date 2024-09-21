// Readability.js is now loaded before this script, so we can use it directly

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getText") {
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (article && article.textContent) {
      console.log("Sending article text to background script");
      console.log(article.textContent);
      sendResponse(article.textContent);
    } else {
      sendResponse(document.body.innerText);
    }
  }
  return true;  // This line is needed to use sendResponse asynchronously
});
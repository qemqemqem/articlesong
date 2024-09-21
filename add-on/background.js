/*
On startup, connect to the "article_singer" app.
*/
let port = browser.runtime.connectNative("article_singer");

/*
Listen for messages from the app.
*/
port.onMessage.addListener((response) => {
  console.log("Received: " + response);
});

/*
Function to get the text content of the current tab
*/
async function getCurrentTabText() {
  let tabs = await browser.tabs.query({active: true, currentWindow: true});
  if (tabs.length > 0) {
    return await browser.tabs.sendMessage(tabs[0].id, {action: "getText"});
  }
  return null;
}

/*
On a click on the browser action, send the current tab's text to the app.
*/
browser.browserAction.onClicked.addListener(async () => {
  let text = await getCurrentTabText();
  if (text) {
    console.log("Sending text to Python app");
    port.postMessage({action: "process_text", text: text});
  } else {
    console.log("Failed to get text from current tab");
  }
});

/*
Inject a content script to get the page text
*/
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    browser.tabs.executeScript(tabId, {
      file: "content_script.js"
    });
  }
});
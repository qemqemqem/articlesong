/*
On startup, connect to the "article_singer" app.
*/
let port = browser.runtime.connectNative("article_singer");

// Store current song information
let currentSong = {
  title: "",
  artist: "",
  duration: ""
};

// Set initial browser action title
updateBrowserActionTitle();

/*
Listen for messages from the app.
*/
port.onMessage.addListener((response) => {
  console.log("Received: ", response);
  if (response.audio_url) {
    forwardAudioUrlToContentScript(response.audio_url);
  }
  if (response.song_info) {
    updateSongInfo(response.song_info);
  }
});

// Function to update song information
function updateSongInfo(songInfo) {
  currentSong = songInfo;
  updateBrowserActionTitle();
}

// Function to update browser action title
function updateBrowserActionTitle() {
  let title = "Turn articles into songs!";
  if (currentSong.title) {
    title = `Now playing: ${currentSong.title} by ${currentSong.artist} (${currentSong.duration})`;
  }
  browser.browserAction.setTitle({ title });
}

/*
Function to get the main content of the current tab
*/
async function getCurrentTabContent() {
  let tabs = await browser.tabs.query({active: true, currentWindow: true});
  if (tabs.length > 0) {
    return await browser.tabs.sendMessage(tabs[0].id, {action: "getText"});
  }
  return null;
}

/*
Function to forward the audio URL to the content script for playback
*/
async function forwardAudioUrlToContentScript(audioUrl) {
  try {
    let tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs.length > 0) {
      console.log('Sending audio URL to content script:', audioUrl);
      // Check if the content script is ready
      const isContentScriptReady = await browser.tabs.sendMessage(tabs[0].id, {action: "ping"}).catch(() => false);
      if (isContentScriptReady) {
        await browser.tabs.sendMessage(tabs[0].id, {action: "playAudio", url: audioUrl});
      } else {
        console.log('Content script not ready, waiting and retrying...');
        // Wait for a short time and retry
        setTimeout(() => forwardAudioUrlToContentScript(audioUrl), 1000);
      }
    } else {
      console.error('No active tab found to send the audio URL');
    }
  } catch (error) {
    console.error('Error sending message to content script:', error);
  }
}

/*
On a click on the browser action, send the current tab's main content to the app.
*/
browser.browserAction.onClicked.addListener(async () => {
  let content = await getCurrentTabContent();
  if (content) {
    console.log("Sending main content to Python app");
//    console.log(content)
    // Function to calculate size in bytes
    function sizeInBytes(str) {
        return new Blob([str]).size;
    }
//    console.log("Content size (bytes):", sizeInBytes(content));
    const payload = {action: "process_text", text: JSON.stringify(content)};
//    console.log("Sending payload to app:", payload);
//    console.log("It is this big:", sizeInBytes(payload));
    port.postMessage(payload);
  } else {
    console.log("Failed to get main content from current tab");
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

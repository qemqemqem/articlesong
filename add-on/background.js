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

// Create context menu items
browser.menus.create({
  id: "spoken-word-song",
  title: "Spoken Word Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "musical-song",
  title: "Musical Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "meme-song",
  title: "Meme Song",
  contexts: ["browser_action"]
});

// Listen for context menu clicks
browser.menus.onClicked.addListener((info, tab) => {
  getCurrentTabContent().then(content => {
    if (content) {
      let songType;
      switch (info.menuItemId) {
        case "spoken-word-song":
          songType = "spoken";
          break;
        case "musical-song":
          songType = "musical";
          break;
        case "meme-song":
          songType = "meme";
          break;
      }
      sendContentToApp(content, songType);
    }
  });
});

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
Function to send content to the app
*/
function sendContentToApp(content, songType = "default") {
  console.log(`Sending main content to Python app for ${songType} song`);
  const payload = {
    action: "process_text",
    text: JSON.stringify(content),
    songType: songType
  };
  port.postMessage(payload);
}

/*
On a click on the browser action, send the current tab's main content to the app.
*/
browser.browserAction.onClicked.addListener(async () => {
  let content = await getCurrentTabContent();
  if (content) {
    sendContentToApp(content);
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
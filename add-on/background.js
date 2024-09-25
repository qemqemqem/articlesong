/*
On startup, connect to the "article_singer" app.
*/
let port = browser.runtime.connectNative("article_singer");

// Store current song information and state
let currentSong = {
  title: "",
  style: "",
  state: "idle", // Can be "idle", "writing", or "playing"
  url: ""
};

// Track start time and elapsed time
let startTime = null;
let elapsedTimeInterval = null;

// Set initial browser action title
updateBrowserActionTitle();

// Expected duration for song writing (in seconds)
const EXPECTED_DURATION = 60;

browser.menus.create({
  id: "musical-song",
  title: "Musical Song (default)",
  contexts: ["browser_action"]
});

// Create context menu items
browser.menus.create({
  id: "spoken-word-song",
  title: "Spoken Word Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "meme-song",
  title: "Meme Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "cute-song",
  title: "Cute Song",
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
        case "cute-song":
          songType = "cute";
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
    stopTimer(); // Stop the timer when we receive the audio URL
//    startTimer(); // Start the timer when we receive the audio URL
  }
  if (response.song_info) {
    console.log("Updating song info", response.song_info);
    updateSongInfo(response.song_info);
  }
  // Store url in currentSong object
  if (response.url) {
    currentSong.url = response.url;
  }
  if (response.song_info && response.song_info.style) {
    // Store style in currentSong object
    currentSong.style = response.song_info.style;
  }
});

// Function to update song information
function updateSongInfo(songInfo) {
  currentSong = {...currentSong, ...songInfo};
  updateBrowserActionTitle();
}

// Function to update browser action title
function updateBrowserActionTitle() {
  let my_title = "Turn articles into songs!";
  if (currentSong.title) {
    let elapsedTime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    let currentTime = new Date().toLocaleTimeString();
    
    if (currentSong.state === "writing") {
      my_title = `Writing song about "${currentSong.title}"\n` +
                 `Have waited ${formatTime(elapsedTime)} out of expected ${EXPECTED_DURATION}s for response`;
    } else if (currentSong.state === "playing") {
      my_title = `Currently playing: "${currentSong.title}"\n` +
                 `Style: ${currentSong.style || 'Unknown'}`;
    }
  }
  browser.browserAction.setTitle({ title: my_title });
}

// Function to format time in MM:SS format
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(1, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Function to start the timer
function startTimer() {
  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
  }
  startTime = Date.now();
  currentSong.state = "writing";
  elapsedTimeInterval = setInterval(() => {
    updateBrowserActionTitle();
    updateBadge();
  }, 1000);
}

// Function to stop the timer
function stopTimer() {
  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
    elapsedTimeInterval = null;
    startTime = null;
    currentSong.state = "playing";
    updateBrowserActionTitle();
    updateBadge();
  }
}

// Function to update the badge
function updateBadge() {
  if (startTime) {
    let elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    browser.browserAction.setBadgeText({ text: formatTime(elapsedTime) });
    browser.browserAction.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
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
        stopTimer(); // Stop the timer when we start playing the audio
        currentSong.state = "playing"; // Update the state to playing
        updateBrowserActionTitle(); // Update the title to reflect the new state
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
async function sendContentToApp(content, songType = "default") {
  console.log(`Sending main content to Python app for ${songType} song`);
  
  let tabs = await browser.tabs.query({active: true, currentWindow: true});
  if (tabs.length > 0) {
    // Set the currentSong title to the tab's title
    currentSong.title = tabs[0].title || "Unknown Title";
    updateBrowserActionTitle();
  }

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
    sendContentToApp(content, "musical"); // Default to musical song type
    startTimer(); // Start the timer when the button is clicked
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

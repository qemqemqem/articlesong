/*
On startup, connect to the "article_singer" app.
*/
let port = browser.runtime.connectNative("article_singer");

// Store current song information and state
let currentSong = {
  title: "",
  style: "",
  state: "idle", // Can be "idle", "writing", or "playing"
  url: "",
  lyrics: ""
};

// Track start time and elapsed time
let startTime = null;
let elapsedTimeInterval = null;

// Store the ID of the tab that made the request
let requestingTabId = null;

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

browser.menus.create({
  id: "informative-song",
  title: "Informative Song",
  contexts: ["browser_action"]
});

browser.menus.create({
  id: "straight-lyrics",
  title: "Use Page Text as Lyrics",
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
        case "informative-song":
          songType = "informative";
          break;
        case "straight-lyrics":
          songType = "straight";
          break;
      }
      requestingTabId = tab.id; // Store the tab ID
      sendContentToApp(content, songType);
      startTimer();
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
    stopTimer();
  }
  if (response.song_info) {
    console.log("Updating song info", response.song_info);
    updateSongInfo(response.song_info);
  }
  if (response.url) {
    currentSong.url = response.url;
  }
  if (response.song_info && response.song_info.style) {
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
                 `Style: ${currentSong.style || 'Unknown'}\n` +
                 `Audio URL: ${currentSong.url}\n` +
                 `\nLyrics: \n${currentSong.lyrics}`;
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
    requestingTabId = tabs[0].id; // Store the tab ID
    return await browser.tabs.sendMessage(tabs[0].id, {action: "getText"});
  }
  return null;
}

/*
Function to forward the audio URL to the content script for playback and download
*/
async function forwardAudioUrlToContentScript(audioUrl) {
  if (currentSong.url === audioUrl && currentSong.state === "playing") {
    console.log('Audio already playing, skipping...');
    return;
  }

  try {
    if (requestingTabId) {
      console.log('Sending audio URL to content script:', audioUrl);
      // Check if the content script is ready
      const isContentScriptReady = await browser.tabs.sendMessage(requestingTabId, {action: "ping"}).catch(() => false);
      if (isContentScriptReady) {
        await browser.tabs.sendMessage(requestingTabId, {action: "playAudio", url: audioUrl});
        stopTimer();
        currentSong.state = "playing";
        currentSong.url = audioUrl;
        updateBrowserActionTitle();

        // Start a 4-minute timer to download the audio
        // NOTE: This is a hack to give the file time to finish streaming.
        // We apologize to the reader for this inelegant solution.
        setTimeout(() => {
          console.log('Downloading audio file...' + audioUrl)
          browser.downloads.download({
            url: audioUrl,
            filename: `${currentSong.title || 'song'}.mp3`
          });
        }, 4 * 60 * 1000); // 4 minutes in milliseconds

        requestingTabId = null; // Reset the requesting tab ID after use
      } else {
        console.log('Content script not ready, waiting and retrying...');
        // Wait for a short time and retry
        setTimeout(() => forwardAudioUrlToContentScript(audioUrl), 1000);
      }
    } else {
      console.error('No requesting tab ID found to send the audio URL');
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

  if (requestingTabId) {
    let tab = await browser.tabs.get(requestingTabId);
    currentSong.title = tab.title || "Unknown Title";
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
  let tabs = await browser.tabs.query({active: true, currentWindow: true});
  if (tabs.length > 0) {
    requestingTabId = tabs[0].id; // Store the tab ID
    let content = await getCurrentTabContent();
    if (content) {
      sendContentToApp(content, "musical"); // Default to musical song type
      startTimer(); // Start the timer when the button is clicked
    } else {
      console.log("Failed to get main content from current tab");
    }
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

// content_script.js

let currentRequestId = null;
let currentAudio = null;

// Function to play audio by injecting an <audio> element
function playAudio(url, requestId) {
  // Store current request ID
  currentRequestId = requestId;
  
  // Check if an audio element already exists
  let existingAudio = document.querySelector('audio[data-article-song]');

  if (existingAudio) {
    // If it exists, update its source and play
    existingAudio.src = url;
    existingAudio.dataset.requestId = requestId;
    existingAudio.play();
    currentAudio = existingAudio;
  } else {
    // If it doesn't exist, create a new audio element
    const audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true; // Adds controls to play/pause
    audio.autoplay = true; // Automatically plays the audio
    audio.dataset.articleSong = 'true';
    audio.dataset.requestId = requestId;

    // Insert the audio element at the top of the webpage
    document.body.insertBefore(audio, document.body.firstChild);
    currentAudio = audio;

    // Track when audio starts playing
    audio.addEventListener('play', function() {
      console.log('Article Song audio is playing');
    });
    
    // Track when audio ends
    audio.addEventListener('ended', function() {
      console.log('Article Song audio ended');
      const reqId = audio.dataset.requestId;
      if (reqId) {
        browser.runtime.sendMessage({
          action: 'audioEnded',
          requestId: reqId
        });
      }
    });

    // Error handling
    audio.addEventListener('error', function(e) {
      console.error('Failed to load Article Song audio:', e);
    });
  }
}

// Function to get text content of the page using Readability
function getText() {
  console.log("Received request to get text content of the page");
  const documentClone = document.cloneNode(true);

  // Remove tables and info boxes before parsing
  const tables = documentClone.getElementsByTagName('table');
  const infoBoxes = documentClone.querySelectorAll('.infobox, .info-box, .sidebar');

  [...tables, ...infoBoxes].forEach(el => el.remove());

  const reader = new Readability(documentClone, {
    classesToPreserve: [],
    removeNodes: ['aside', 'figure', 'figcaption'],
    disableJSONLD: true
  });

  const article = reader.parse();

  if (article && article.textContent) {
    console.log("Sending article text to background script");
    console.log(article.textContent);
    return article.textContent;
  } else {
    return document.body.innerText;
  }
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "playAudio" && request.url) {
    // Handle the playAudio action
    playAudio(request.url, request.requestId);
    sendResponse({ status: "Audio playing" });
  } else if (request.action === "getText") {
    // Handle the getText action
    const text = getText();
    sendResponse({ text: text });
  } else if (request.action === "ping") {
    // Respond to ping to indicate content script is ready
    sendResponse({ status: "ready" });
  }

  // Returning true keeps the message channel open for async responses
  return true;
});

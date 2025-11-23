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

// Function to get selected text
function getSelectedText() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  console.log("Selected text:", text ? `${text.length} chars` : 'none');
  return text;
}

// Function to count words in text
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
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
  } else if (request.action === "stopAudio") {
    // Stop and remove audio element
    const audio = document.querySelector(`audio[data-request-id="${request.requestId}"]`);
    if (audio) {
      audio.pause();
      audio.remove();
      console.log('Article Song audio stopped and removed');
    }
    sendResponse({ status: "Audio stopped" });
  } else if (request.action === "togglePlayPause") {
    // Toggle play/pause on audio element
    // Try currentAudio first, then query selector as fallback
    let audio = currentAudio;
    if (!audio || audio.dataset.requestId !== request.requestId) {
      audio = document.querySelector(`audio[data-request-id="${request.requestId}"]`);
    }
    
    if (audio) {
      if (audio.paused) {
        audio.play().then(() => {
          console.log('Article Song audio resumed');
          sendResponse({ success: true, isPlaying: true });
        }).catch(error => {
          console.error('Failed to play audio:', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        audio.pause();
        console.log('Article Song audio paused');
        sendResponse({ success: true, isPlaying: false });
      }
    } else {
      console.error('Audio element not found for requestId:', request.requestId);
      sendResponse({ success: false, error: 'Audio element not found' });
    }
    return true; // Keep channel open for async response
  } else if (request.action === "checkAudioStatus") {
    // Check if audio element exists and is playing
    let audio = currentAudio;
    if (!audio || audio.dataset.requestId !== request.requestId) {
      audio = document.querySelector(`audio[data-request-id="${request.requestId}"]`);
    }
    
    if (audio) {
      // Audio exists - check if it's playing
      const isPlaying = !audio.paused && !audio.ended && audio.currentTime > 0;
      console.log('Audio status check:', { exists: true, paused: audio.paused, ended: audio.ended, currentTime: audio.currentTime, isPlaying });
      sendResponse({ 
        isPlaying: true, // Audio element exists
        isPaused: audio.paused,
        isEnded: audio.ended,
        currentTime: audio.currentTime
      });
    } else {
      console.log('Audio element not found in DOM');
      sendResponse({ isPlaying: false });
    }
  } else if (request.action === "getSelection") {
    // Get selected text and word count
    const selectedText = getSelectedText();
    const wordCount = countWords(selectedText);
    sendResponse({ 
      hasSelection: wordCount > 0,
      selectedText: selectedText,
      wordCount: wordCount
    });
  }

  // Returning true keeps the message channel open for async responses
  return true;
});

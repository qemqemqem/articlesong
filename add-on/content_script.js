// content_script.js

let currentRequestId = null;
let currentAudio = null;

// Play audio by injecting an <audio> element. Resolves once playback started;
// rejects if the page's CSP / autoplay policy blocks it, so the background can fall back.
async function playAudio(url, requestId) {
  currentRequestId = requestId;
  let audio = document.querySelector('audio[data-article-song]');
  
  if (audio) {
    audio.src = url;
    audio.dataset.requestId = requestId;
  } else {
    audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true;
    audio.dataset.articleSong = 'true';
    audio.dataset.requestId = requestId;
    document.body.insertBefore(audio, document.body.firstChild);
    
    audio.addEventListener('ended', function() {
      const reqId = audio.dataset.requestId;
      if (reqId) {
        browser.runtime.sendMessage({ action: 'audioEnded', requestId: reqId });
      }
    });
  }
  currentAudio = audio;
  
  try {
    await audio.play();
  } catch (error) {
    audio.remove(); // don't leave a dead player in the page
    currentAudio = null;
    throw error;
  }
}

// Article extraction (shadow-DOM flattening, consent-banner removal, Readability) lives in
// article_extract.js, which is shared with the Android app and loaded before this file.
function getText() {
  return extractArticleText(document);
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

function findAudio(requestId) {
  if (currentAudio && currentAudio.dataset.requestId === requestId) return currentAudio;
  return document.querySelector(`audio[data-request-id="${requestId}"]`);
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "playAudio" && request.url) {
    playAudio(request.url, request.requestId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
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
      const wantPlay = request.playing !== undefined ? request.playing : audio.paused;
      if (wantPlay) {
        audio.play().then(() => {
          sendResponse({ success: true, isPlaying: true });
        }).catch(error => {
          console.error('Failed to play audio:', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        audio.pause();
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
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : null
      });
    } else {
      console.log('Audio element not found in DOM');
      sendResponse({ isPlaying: false });
    }
  } else if (request.action === "seekAudio") {
    const audio = findAudio(request.requestId);
    if (!audio) {
      sendResponse({ success: false, error: 'Audio element not found' });
    } else {
      const target = request.time !== undefined ? request.time : audio.currentTime + request.delta;
      const max = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      audio.currentTime = Math.max(0, Math.min(target, max));
      sendResponse({ success: true, currentTime: audio.currentTime });
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

// content_script.js

// Function to play audio by injecting an <audio> element
function playAudio(url) {
  // Check if an audio element already exists
  let existingAudio = document.querySelector('audio');
  
  if (existingAudio) {
    // If it exists, update its source and play
    existingAudio.src = url;
    existingAudio.play();
  } else {
    // If it doesn't exist, create a new audio element
    const audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true; // Adds controls to play/pause
    audio.autoplay = true; // Automatically plays the audio

    // Insert the audio element at the top of the webpage
    document.body.insertBefore(audio, document.body.firstChild);

    // Optionally, add an event listener to track when the audio starts playing
    audio.addEventListener('play', function() {
      console.log('Audio is playing');
    });

    // Error handling in case of CORS issues
    audio.addEventListener('error', function(e) {
      console.error('Failed to load audio:', e);
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
    playAudio(request.url);
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

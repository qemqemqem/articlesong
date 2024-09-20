// background.js

// Log when the background script is loaded
console.log('Background script loaded.');

browser.browserAction.onClicked.addListener((tab) => {
  console.log('Browser action clicked.');

  browser.tabs.sendMessage(tab.id, { action: 'getText' }).then((response) => {
    console.log('Received page text from content script.');
    const pageText = response.text;

    browser.storage.local.get('apiKey').then((data) => {
      const apiKey = data.apiKey || '';
      console.log('Retrieved API key from storage.');

      const port = browser.runtime.connectNative('songify');
      console.log('Connected to native application.');

      port.postMessage({ text: pageText, apiKey: apiKey });
      console.log('Sent message to native application.');

      port.onMessage.addListener((message) => {
        console.log('Received message from native application.');
        if (message.audioData) {
          console.log('Audio data received. Playing audio.');
          playAudio(message.audioData);
        } else if (message.error) {
          console.error('Error from native application:', message.error);
        } else {
          console.error('No audio data received.');
        }
      });

      port.onDisconnect.addListener(() => {
        if (port.error) {
          console.error(`Disconnected due to an error: ${port.error.message}`);
        } else {
          console.log('Port disconnected.');
        }
      });
    });
  }).catch((error) => {
    console.error(`Error sending message to content script: ${error}`);
  });
});

// Function to play the audio data
function playAudio(base64Audio) {
  const audioSrc = 'data:audio/wav;base64,' + base64Audio;
  const audio = new Audio(audioSrc);
  audio.play().catch((error) => {
    console.error(`Audio playback failed: ${error}`);
  });
}

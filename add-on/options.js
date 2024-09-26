function saveOptions(e) {
  e.preventDefault();
  browser.storage.sync.set({
    openai_api_key: document.getElementById('openai_api_key').value,
    piapi_key: document.getElementById('piapi_key').value
  });
}

function restoreOptions() {
  function setCurrentChoice(result) {
    document.getElementById('openai_api_key').value = result.openai_api_key || '';
    document.getElementById('piapi_key').value = result.piapi_key || '';
  }

  let getting = browser.storage.sync.get(['openai_api_key', 'piapi_key']);
  getting.then(setCurrentChoice, console.error);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#save').addEventListener('click', saveOptions);

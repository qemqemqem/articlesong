// Load the saved API key on startup
browser.storage.local.get('apiKey').then((data) => {
  document.getElementById('apiKey').value = data.apiKey || '';
});

// Save the API key when the button is clicked
document.getElementById('save').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKey').value;
  browser.storage.local.set({ apiKey }).then(() => {
    const status = document.getElementById('status');
    status.textContent = 'API key saved.';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});

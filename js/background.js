importScripts("selectors.js", "common.js");

// Set default options on install
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    // Call loadOptions to set default values
    loadOptions();
  }
});

// Listener for messages from popup to save options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveOptions') {
    // Save the options sent from the popup
    chrome.storage.sync.set({
      'options': request.options
    }, () => {
      // After saving, broadcast the changes to all tabs
      sendOptions(request.options);
    });
    // Return true to indicate you wish to send a response asynchronously
    // (although we don't send one here, it's good practice)
    return true;
  }
});

// Load options from local storage
// Return default values if none exist
function loadOptions(callback) {
  chrome.storage.sync.get('options', items => {
    let options = items['options'];
    if (options == null || options === "{}") {
      options = {};
    }

    options.skipStillHere = options.hasOwnProperty('skipStillHere') ? options.skipStillHere : true;
    options.autoPlayNext = options.hasOwnProperty('autoPlayNext') ? options.autoPlayNext : true;
    options.watchCredits = options.hasOwnProperty('watchCredits') ? options.watchCredits : false;
    options.skipTitleSequence = options.hasOwnProperty('skipTitleSequence') ? options.skipTitleSequence : true;
    options.disableAutoPlayOnBrowse = options.hasOwnProperty('disableAutoPlayOnBrowse') ? options.disableAutoPlayOnBrowse : false;
    options.dontMinimzeEndCreditsOfShow = options.hasOwnProperty('dontMinimzeEndCreditsOfShow') ? options.dontMinimzeEndCreditsOfShow : false;
    options.hideDisliked = options.hasOwnProperty('hideDisliked') ? options.hideDisliked : false;
    options.highContrast = options.hasOwnProperty('highContrast') ? options.highContrast : false;

    chrome.storage.sync.set({
      'options': options
    }, _ => {
      if (callback) {
        callback(options);
      }
    });
  });
}

// Send options to all tabs and extension pages
async function sendOptions(options) {
  const request = {
    action: 'optionsChanged',
    'options': options
  };

  // Send options to all tabs
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      // Errors are expected for tabs that cannot be scripted, such as chrome:// pages.
      chrome.tabs.sendMessage(tab.id, request).catch(error => {
        if (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist")) {
          // This is an expected error when a tab doesn't have the content script injected.
          // We can safely ignore it.
        } else {
          console.warn(`NEN: Error sending message to tab ${tab.id}:`, error);
        }
      });
    }
  } catch (error) {
    console.error("NEN: Error querying tabs", error);
  }

  // Send options to other extension pages (e.g., popup)
  try {
    // This can also error if the popup isn't open, which is fine.
    chrome.runtime.sendMessage(request).catch(error => {
        if (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist")) {
          // Expected if no other extension pages are open.
        } else {
          console.warn("NEN: Error sending message to runtime:", error);
        }
    });
  } catch (error) {
    console.error("NEN: Error sending message to runtime", error);
  }
}

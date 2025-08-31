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
        callback(options);
    });
    });

}

function injectScript(file_path, tag) {
    var node = document.getElementsByTagName(tag)[0];
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', file_path);
    node.appendChild(script);
}
  
injectScript(chrome.runtime.getURL('js/playerInject.js'), 'body');
injectScript(chrome.runtime.getURL('js/selectors.js'), 'body');

let options;
let fuse;

$(() => {
    $('body').on('click', 'a', function () {
        if (this && $(this).attr('href')) {
            chrome.tabs.create({url: $(this).attr('href')});
        }
        return false;
    });
    loadOptions(function (recOptions) {
        options = recOptions;
        // Set values on page to those saved
        $("#chkTitleSequence").prop('checked', options.skipTitleSequence);
        $("#chkPromptStillHere").prop('checked', options.skipStillHere);
        $("#chkPlayNext").prop('checked', options.autoPlayNext);
        $("#chkWatchCredits").prop('checked', options.watchCredits);
        $("#chkDontMinimzeEndCreditsOfShow").prop('checked', options.dontMinimzeEndCreditsOfShow);
        $("#chkDisAutoPlayInBrowse").prop('checked', options.disableAutoPlayOnBrowse);
        $("#chkHideDownvoted").prop('checked', options.hideDisliked);

        if (options.highContrast) {
            $("#contrast").text("Normal Contrast Mode");
            $("#contrast").attr('data-value', "high");
        } else {
            $("#contrast").text("High Contrast Mode");
            $("#contrast").attr('data-value', "low");
        }

        // Trigger gumby update to show visual changes
        $('input:checked').trigger('gumby.check');

        $('input').parent().on('gumby.onChange', function () {
            changeOption(this);
        });

        reloadSearchLibrary();
        searchOnTypingListener();
        registerContrastModeHandler();
        setContrastMode();
    });
});

function registerContrastModeHandler() {
    $("#contrast").click(e => {
        if ($("#contrast").attr('data-value') === "high") {
            $("#contrast").attr('data-value', "low");
            options.highContrast = false;
            $("#contrast").text("High Contrast Mode");
        } else {
            $("#contrast").attr('data-value', "high");
            options.highContrast = true;
            $("#contrast").text("Normal Contrast Mode");
        }
        saveOptions();
        setContrastMode();
    });
}

function setContrastMode() {
    if (options.highContrast) {
        $("body").addClass("high-contrast");
        $("a").addClass("high-contrast");
        $("#genreSearch").addClass("high-contrast");
        $(".checkBackground").addClass("high-contrast");
        $(".checkBackground").removeClass("checkBackground");
    } else {
        $("body").removeClass("high-contrast");
        $("a").removeClass("high-contrast");
        $(".high-contrast").addClass("checkBackground");
        $("#genreSearch").removeClass("high-contrast");
        $(".high-contrast").removeClass("high-contrast");
    }
}

function constructResultDiv(elem) {
    return `<div class='entry'><a href="${elem.link}">${elem.genre}</a></div>`;
}

function reloadSearchLibrary() {
    $.ajax({
        method: 'GET',
        url: chrome.runtime.getURL("data/genres.json"),
        dataType: 'json',
        success: function (data, textStatus, jqXHR) {
            let options = {
                shouldSort: true,
                threshold: 0.6,
                location: 0,
                distance: 100,
                maxPatternLength: 32,
                minMatchCharLength: 1,
                keys: ["genre"]
            };
            fuse = new Fuse(data, options); // Text search library through all genres
        }
    });
}

function searchOnTypingListener() {
    /*Event listenere for typing in genre*/
    $('#genreSearch').on('keyup', function () {
        // Clear previous results
        $("#results").html("");
        // If fuse is loaded, do a search
        if (fuse) {
            // do search for this.value here
            let results = fuse.search(this.value);
            if (results.length) {
                let max = results.length < 100 ? results.length : 100;
                let entry = "";
                for (let i = 0; i < max; i++) {
                    entry += constructResultDiv(results[i]);
                }
                $("#results").append(entry);
            }
        } else {
            $("#results").append("<div class='entry'>Genres not loaded! Contact developer if issue persists.</div>");
        }
    });
}

function changeOption(elem) {
    switch (elem.htmlFor) {
        case "chkTitleSequence":
            options.skipTitleSequence = $('#chkTitleSequence')[0].checked;
            break;
        case "chkPlayNext":
            options.autoPlayNext = $('#chkPlayNext')[0].checked;
            if (options.autoPlayNext && options.watchCredits) {
                options.watchCredits = false;
                // Uncheck the watch credits checkbox, as you can't both watch the credits and skip them
                $('#chkWatchCredits').click();
            }
            break;
        case "chkPromptStillHere":
            options.skipStillHere = $('#chkPromptStillHere')[0].checked;
            break;
        case "chkDisAutoPlayInBrowse":
            options.disableAutoPlayOnBrowse = $('#chkDisAutoPlayInBrowse')[0].checked;
            break;
        case "chkDontMinimzeEndCreditsOfShow":
            options.dontMinimzeEndCreditsOfShow = $('#chkDontMinimzeEndCreditsOfShow')[0].checked;
            break;
        case "chkWatchCredits":
            options.watchCredits = $('#chkWatchCredits')[0].checked;
            if (options.autoPlayNext && options.watchCredits) {
                options.autoPlayNext = false;
                // Uncheck the auto play next checkbox, as you can't both watch the credits and skip them
                $("#chkPlayNext").click();
            }
            break;
        case "chkHideDownvoted":
            options.hideDisliked = $('#chkHideDownvoted')[0].checked;
            break;
    }
    saveOptions();

}

// Send options to background script to save and distribute
function saveOptions() {
    chrome.runtime.sendMessage({
        action: 'saveOptions',
        'options': options
    });
}

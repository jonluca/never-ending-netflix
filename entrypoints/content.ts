import { NETFLIX_MATCHES } from "../netflix-matches";
import { normalizeOptions, type Options } from "../options";

const END_OF_EPISODE_WINDOW_S = 10;
const ADVANCE_LOCK_MS = 4_000;
const ACTION_LOCK_MS = 2_000;
const ACTIVATE_EVENT = "nen:activate";

const selectors = {
  nextEpisode: [
    '[data-uia="next-episode-seamless-button"]',
    '[data-uia="next-episode-seamless-button-draining"]',
    ".WatchNext-autoplay",
    ".WatchNext-still-hover-container",
    '[aria-label^="Next episode"]'
  ],
  skipIntro: [
    '[data-uia="player-skip-intro"]',
    '[aria-label="Skip Intro"]',
    ".skip-credits > a",
    ".watch-video--skip-content > button"
  ],
  continueWatching: [
    '[data-uia="interrupt-autoplay-continue"]',
    ".interrupter-actions > .nf-icon-button:first-child",
    '[aria-label^="Continue Playing"]'
  ],
  watchCredits: ['[data-uia^="watch-credits-seamless-button"]', '[aria-label^="Watch credits"]'],
  maximizePlayer: [".watch-video--player-view-minimized > div"]
};

type Action = keyof typeof selectors;

function isClickable(element: HTMLElement): boolean {
  if (element.matches(":disabled") || element.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) {
    return false;
  }
  // Fixed-position player controls have no offsetParent, but do have client rects.
  const rect = element.getClientRects()[0];
  if (!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) {
    return false;
  }
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.visibility === "collapse" || style.display === "none" || style.opacity === "0") return false;
  }
  return true;
}

function findTarget(action: Action): HTMLElement | undefined {
  for (const selector of selectors[action]) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isClickable);
    if (element) return element;
  }
  return undefined;
}

function activate(element: HTMLElement): void {
  // MAIN selects either React's pointer handler or a click on this exact target.
  // Cancellation acknowledges synchronous handling; never click it a second time.
  if (element.dispatchEvent(new Event(ACTIVATE_EVENT, { bubbles: true, cancelable: true }))) element.click();
}

export default defineContentScript({
  matches: [...NETFLIX_MATCHES],
  main(ctx) {
    // Do not run default-enabled actions before the user's saved settings arrive.
    let options: Options | undefined;
    let settingsRevision = 0;
    let advanceLockedUntil = 0;
    let advanced = false;
    let previousVideo: HTMLVideoElement | null = null;
    let previousPath = location.pathname;
    let previousSource = "";
    let previousTime = 0;
    const lastAction = new Map<Action, { element: HTMLElement; at: number }>();
    const hiddenElements = new Map<HTMLElement, { display: string; priority: string }>();

    const actOnce = (action: Action): boolean => {
      const element = findTarget(action);
      if (!element) {
        // A prompt may appear again later (for example, recap followed by intro).
        lastAction.delete(action);
        return false;
      }
      const previous = lastAction.get(action);
      if (previous?.element === element || (previous && Date.now() - previous.at < ACTION_LOCK_MS)) return false;
      lastAction.set(action, { element, at: Date.now() });
      activate(element);
      return true;
    };

    const updateHiddenElements = () => {
      const toHide = new Set<HTMLElement>();
      if (options?.disableAutoPlayOnBrowse) {
        for (const billboard of document.querySelectorAll<HTMLElement>(".billboard-row")) toHide.add(billboard);
      }
      if (options?.hideDisliked && !/^\/search(?:\/|$)/.test(location.pathname)) {
        for (const disliked of document.querySelectorAll<HTMLElement>(".is-disliked")) {
          const card = disliked.closest<HTMLElement>(".slider-item");
          if (card) toHide.add(card);
        }
      }
      for (const [element, original] of hiddenElements) {
        if (toHide.has(element)) continue;
        // Preserve page changes made while our setting was enabled.
        if (element.style.getPropertyValue("display") === "none") {
          if (original.display) element.style.setProperty("display", original.display, original.priority);
          else element.style.removeProperty("display");
        }
        hiddenElements.delete(element);
      }
      for (const element of toHide) {
        if (!hiddenElements.has(element)) {
          hiddenElements.set(element, {
            display: element.style.getPropertyValue("display"),
            priority: element.style.getPropertyPriority("display")
          });
        }
        if (element.style.getPropertyValue("display") !== "none") element.style.setProperty("display", "none");
      }
    };

    const scan = () => {
      if (!options || ctx.isInvalid) return;
      const video = document.querySelector<HTMLVideoElement>(".watch-video--player-view video") ?? document.querySelector<HTMLVideoElement>("video");
      const source = video?.currentSrc || video?.getAttribute("src") || "";
      const validPlayback = Boolean(video && Number.isFinite(video.duration) && video.duration > 0 && Number.isFinite(video.currentTime) && video.currentTime >= 0);
      const isEnding = Boolean(validPlayback && video && (video.ended || video.duration - video.currentTime <= END_OF_EPISODE_WINDOW_S));
      const restarted = Boolean(validPlayback && video && video.currentTime + END_OF_EPISODE_WINDOW_S < previousTime);
      if (video !== previousVideo || location.pathname !== previousPath || source !== previousSource || restarted) {
        lastAction.clear();
      }
      // Keep the latch across DOM/button remounts and unknown/loading metadata.
      // Rearm only after playback is observed outside the end-of-episode window.
      if (validPlayback && !isEnding) advanced = false;
      previousVideo = video;
      previousPath = location.pathname;
      previousSource = source;
      previousTime = video?.currentTime ?? 0;

      // One action per scan: a control can synchronously change the video.
      if (
        (options.skipStillHere && actOnce("continueWatching")) ||
        (options.skipTitleSequence && actOnce("skipIntro")) ||
        // Credits controls appear well before the final ten seconds.
        (options.watchCredits && actOnce("watchCredits")) ||
        (options.dontMinimzeEndCreditsOfShow && actOnce("maximizePlayer"))
      ) {
        updateHiddenElements();
        return;
      }

      if (options.autoPlayNext && !options.watchCredits && /^\/watch\//.test(location.pathname) && isEnding && !advanced && Date.now() >= advanceLockedUntil) {
        const target = findTarget("nextEpisode");
        if (target) {
          // Set the latch before dispatch: the action can synchronously remount UI.
          advanced = true;
          advanceLockedUntil = Date.now() + ADVANCE_LOCK_MS;
          activate(target);
        }
      }
      updateHiddenElements();
    };

    let scanQueued = false;
    const scheduleScan = () => {
      if (scanQueued) return;
      scanQueued = true;
      queueMicrotask(() => {
        scanQueued = false;
        scan();
      });
    };

    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area === "sync" && changes.options) {
        settingsRevision++;
        options = normalizeOptions(changes.options.newValue);
        scan();
      }
    };
    browser.storage.onChanged.addListener(onStorageChanged);

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-disabled", "disabled", "data-uia"]
    });
    ctx.addEventListener(window, "hashchange", scheduleScan);
    ctx.addEventListener(window, "popstate", scheduleScan);
    ctx.addEventListener(window, "wxt:locationchange", scheduleScan);
    // Media progress does not necessarily mutate the DOM. Capture non-bubbling events.
    for (const event of ["timeupdate", "loadedmetadata", "durationchange", "ended", "emptied"]) {
      ctx.addEventListener(document, event, scheduleScan, { capture: true });
    }
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.storage.onChanged.removeListener(onStorageChanged);
      options = undefined;
      updateHiddenElements();
    });

    const revision = settingsRevision;
    void browser.storage.sync.get("options").then((stored) => {
      // A newer storage event wins over an older in-flight read.
      if (settingsRevision !== revision || ctx.isInvalid) return;
      options = normalizeOptions(stored.options);
      scan();
    }).catch(() => {
      // Leave automation inactive if settings cannot be read.
    });
  }
});

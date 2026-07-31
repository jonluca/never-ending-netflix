import { NETFLIX_MATCHES } from "../netflix-matches";

type Options = {
  skipStillHere: boolean;
  autoPlayNext: boolean;
  watchCredits: boolean;
  skipTitleSequence: boolean;
  disableAutoPlayOnBrowse: boolean;
  dontMinimzeEndCreditsOfShow: boolean;
  hideDisliked: boolean;
  highContrast: boolean;
};

const DEFAULT_OPTIONS: Options = {
  skipStillHere: true,
  autoPlayNext: true,
  watchCredits: false,
  skipTitleSequence: true,
  disableAutoPlayOnBrowse: false,
  dontMinimzeEndCreditsOfShow: false,
  hideDisliked: false,
  highContrast: false
};

function normalizeOptions(value: unknown): Options {
  return { ...DEFAULT_OPTIONS, ...(typeof value === "object" && value ? value : {}) };
}

export default defineContentScript({
  matches: [...NETFLIX_MATCHES],
  main() {
    let options = DEFAULT_OPTIONS;
    const lastClicked = new WeakMap<Element, number>();

    const dispatchPageEvent = (type: string) => {
      document.dispatchEvent(new Event(type, { bubbles: true }));
    };

    const click = (element: HTMLElement, pageEvent?: string) => {
      const now = Date.now();
      if (now - (lastClicked.get(element) ?? 0) < 2_000) return;
      lastClicked.set(element, now);
      element.click();
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      if (pageEvent) dispatchPageEvent(pageEvent);
    };

    const scan = () => {
      const targets: Array<{ selector: string; event?: string }> = [];
      if (options.autoPlayNext) {
        targets.push(
          { selector: ".WatchNext-autoplay", event: "nextEpEvent" },
          { selector: ".WatchNext-still-hover-container", event: "nextEpEvent" },
          { selector: '[aria-label^="Next episode"]', event: "nextEpEvent" },
          { selector: '[data-uia^="next-episode-seamless-button"]', event: "nextEpEvent" },
          { selector: ".draining", event: "nextEpEvent" }
        );
      }
      if (options.skipTitleSequence) {
        targets.push(
          { selector: '[aria-label="Skip Intro"]', event: "skipIntroEvent" },
          { selector: '[data-uia="player-skip-intro"]', event: "skipIntroEvent" },
          { selector: ".skip-credits > a", event: "skipIntroEvent" },
          { selector: ".watch-video--skip-content > button", event: "skipIntroEvent" }
        );
      }
      if (options.skipStillHere) {
        targets.push(
          { selector: '[data-uia="interrupt-autoplay-continue"]', event: "continueWatchingEvent" },
          { selector: ".interrupter-actions > .nf-icon-button:first-child", event: "continueWatchingEvent" },
          { selector: '[aria-label^="Continue Playing"]', event: "continueWatchingEvent" }
        );
      }
      if (options.watchCredits) {
        targets.push(
          { selector: '[aria-label^="Watch credits"]', event: "watchCreditsEvent" },
          { selector: '[data-uia^="watch-credits-seamless-button"]', event: "watchCreditsEvent" }
        );
      }
      if (options.dontMinimzeEndCreditsOfShow) {
        targets.push({ selector: ".watch-video--player-view-minimized > div" });
      }

      for (const target of targets) {
        for (const element of document.querySelectorAll<HTMLElement>(target.selector)) click(element, target.event);
      }

      if (options.disableAutoPlayOnBrowse) {
        for (const billboard of document.querySelectorAll<HTMLElement>(".billboard-row")) billboard.style.display = "none";
      }
      if (options.hideDisliked && location.pathname !== "/search") {
        for (const disliked of document.querySelectorAll<HTMLElement>(".is-disliked")) {
          const card = disliked.closest<HTMLElement>(".slider-item");
          if (card) card.style.display = "none";
        }
      }
    };

    const load = async () => {
      const stored = await browser.storage.sync.get("options");
      options = normalizeOptions(stored.options);
      await browser.storage.sync.set({ options });
      scan();
    };

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.options) {
        options = normalizeOptions(changes.options.newValue);
        scan();
      }
    });
    browser.runtime.onMessage.addListener((message) => {
      if (message?.action === "optionsChanged") {
        options = normalizeOptions(message.options);
        scan();
      }
    });

    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("hashchange", scan);
    void load();
  }
});

import { NETFLIX_MATCHES } from "../netflix-matches";

export default defineContentScript({
  matches: [...NETFLIX_MATCHES],
  world: "MAIN",
  main() {
    const selectors = {
      continueWatching: [
        '[data-uia="interrupt-autoplay-continue"]',
        ".interrupter-actions > .nf-icon-button:first-child",
        '[aria-label^="Continue Playing"]'
      ],
      nextEpisode: [
        ".WatchNext-autoplay",
        ".WatchNext-still-hover-container",
        '[aria-label^="Next episode"]',
        '[data-uia^="next-episode-seamless-button"]',
        ".draining"
      ],
      skipIntro: [
        '[aria-label="Skip Intro"]',
        '[data-uia="player-skip-intro"]',
        ".skip-credits > a",
        ".watch-video--skip-content > button"
      ],
      watchCredits: ['[aria-label^="Watch credits"]', '[data-uia^="watch-credits-seamless-button"]']
    };

    const triggerReactHandler = (selectorList: readonly string[]) => {
      const element = selectorList.map((selector) => document.querySelector<HTMLElement>(selector)).find(Boolean);
      if (!element) return;
      const reactKey = Object.keys(element).find((key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"));
      const reactValue = reactKey ? (element as unknown as Record<string, any>)[reactKey] : undefined;
      reactValue?.onPointerDown?.(new PointerEvent("pointerdown", { bubbles: true }));
      reactValue?.memoizedProps?.onPointerDown?.(new PointerEvent("pointerdown", { bubbles: true }));
      element.click();
    };

    const retry = (operation: () => void) => {
      operation();
      const interval = setInterval(operation, 500);
      setTimeout(() => clearInterval(interval), 2_000);
    };

    document.addEventListener("playEvent", () => {
      retry(() => {
        const netflixWindow = window as unknown as {
          netflix?: { appContext?: { state?: { playerApp?: { getAPI?: () => any } } } };
        };
        const api = netflixWindow.netflix?.appContext?.state?.playerApp?.getAPI?.();
        const sessionId = api?.videoPlayer?.getAllPlayerSessionIds?.()[0];
        api?.videoPlayer?.getVideoPlayerBySessionId?.(sessionId)?.play?.();
      });
    });
    document.addEventListener("continueWatchingEvent", () => retry(() => triggerReactHandler(selectors.continueWatching)));
    document.addEventListener("nextEpEvent", () => retry(() => triggerReactHandler(selectors.nextEpisode)));
    document.addEventListener("skipIntroEvent", () => retry(() => triggerReactHandler(selectors.skipIntro)));
    document.addEventListener("watchCreditsEvent", () => retry(() => triggerReactHandler(selectors.watchCredits)));
  }
});

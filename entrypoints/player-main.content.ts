import { NETFLIX_MATCHES } from "../netflix-matches";

/**
 * Este script roda no MAIN world porque só ele vê o objeto `window.netflix`
 * (usado para despausar o vídeo). As ações de "próximo episódio" e
 * "assistir créditos" NÃO devem insistir: avançar é transição de estado.
 *
 * Bug 3.0.1: aqui havia `retry()` (clique a cada 500 ms por 2 s) para
 * `nextEpEvent`. Como o content script já clicava no botão e depois disparava
 * o evento, o mesmo "próximo" era executado 2–3 vezes; com o botão do episódio
 * seguinte já remontado, o retry pulava mais um → 1 → 3.
 */
const ADVANCE_LOCK_MS = 4_000;

/** Só avança quando o episódio corrente realmente está acabando (ver content.ts). */
const END_OF_EPISODE_WINDOW_S = 10;

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
        '[data-uia="next-episode-seamless-button"]',
        '[aria-label^="Next episode"]',
        ".WatchNext-autoplay",
        ".WatchNext-still-hover-container",
        ".draining"
      ],
      skipIntro: [
        '[aria-label="Skip Intro"]',
        '[data-uia="player-skip-intro"]',
        ".skip-credits > a",
        ".watch-video--skip-content > button"
      ],
      watchCredits: ['[data-uia^="watch-credits-seamless-button"]', '[aria-label^="Watch credits"]']
    };

    let advanceLockedUntil = 0;

    // `offsetParent` é null em elementos `position: fixed` (controles do player),
    // então a visibilidade vem das client rects.
    const isClickable = (element: HTMLElement) => {
      if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
      const rect = element.getClientRects()[0];
      if (!rect) return false;
      return rect.width > 0 && rect.height > 0;
    };

    const triggerReactHandler = (selectorList: readonly string[]) => {
      const element = selectorList
        .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
        .find(isClickable);
      if (!element) return;
      const reactKey = Object.keys(element).find((key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"));
      const reactValue = reactKey ? (element as unknown as Record<string, any>)[reactKey] : undefined;
      reactValue?.onPointerDown?.(new PointerEvent("pointerdown", { bubbles: true }));
      reactValue?.memoizedProps?.onPointerDown?.(new PointerEvent("pointerdown", { bubbles: true }));
      element.click();
    };

    const currentEpisodeIsEnding = (): boolean => {
      const video = document.querySelector<HTMLVideoElement>("video");
      if (!video) return true;
      const { duration, currentTime } = video;
      if (!Number.isFinite(duration) || duration <= 0) return true;
      return duration - currentTime <= END_OF_EPISODE_WINDOW_S;
    };

    /** Tentativa única: sem repetição, com trava e só no fim do episódio. */
    const advanceOnce = (selectorList: readonly string[]) => {
      const now = Date.now();
      if (now < advanceLockedUntil) return;
      if (!currentEpisodeIsEnding()) return;
      advanceLockedUntil = now + ADVANCE_LOCK_MS;
      triggerReactHandler(selectorList);
    };

    /** Repetição só faz sentido para despausar e para pular abertura. */
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
    document.addEventListener("nextEpEvent", () => advanceOnce(selectors.nextEpisode));
    document.addEventListener("skipIntroEvent", () => retry(() => triggerReactHandler(selectors.skipIntro)));
    document.addEventListener("watchCreditsEvent", () => advanceOnce(selectors.watchCredits));
  }
});

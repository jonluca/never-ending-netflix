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

/**
 * Janela de bloqueio depois de avançar de episódio.
 *
 * Motivo (bug 3.0.1): avançar de episódio é uma transição de estado, não um
 * botão que precisa de insistência. A versão 3.0.0 clicava em TODOS os elementos
 * que casavam com "próximo episódio" na mesma varredura
 * (`.WatchNext-autoplay`, `[aria-label^="Next episode"]`,
 * `[data-uia^="next-episode-seamless-button"]` — que casa também com
 * `-draining`, `.draining`), e ainda disparava `nextEpEvent`, que o script do
 * MAIN world tratava com retry a cada 500 ms por 2 s. Resultado: 2 a 3
 * avanços por episódio → o usuário via 1 → 3 e perdia o episódio 2.
 *
 * 4 s cobrem a transição completa do Netflix (fade + novo vídeo + botões
 * remontados) sem atrapalhar quem aperta "próximo" na mão.
 */
const ADVANCE_LOCK_MS = 4_000;

/**
 * Folga de fim de episódio, em segundos.
 *
 * Segunda linha de defesa (bug relatado: terminou o ep. 11, o 12 começou, rodou
 * 3 s e pulou para o 13). O Netflix mantém o botão "próximo" montado por alguns
 * segundos depois da transição — qualquer varredura nessa janela avançava de
 * novo. Aqui a regra é semântica, não cronológica: se o vídeo atual ainda tem
 * mais de 10 s para acabar, "próximo episódio" não é uma ação válida agora.
 */
const END_OF_EPISODE_WINDOW_S = 10;

/**
 * Elemento realmente clicável: renderizado (tem área) e não desabilitado.
 *
 * Não dá para usar `offsetParent`: ele é `null` justamente para elementos
 * `position: fixed`, que é como o player do Netflix posiciona os controles
 * (a checagem ingênua fazia a extensão nunca avançar). `getClientRects()`
 * funciona nos dois casos e ainda descarta botões pré-montados fora da tela.
 */
function isClickable(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
  const rect = element.getClientRects()[0];
  if (!rect) return false;
  return rect.width > 0 && rect.height > 0;
}

export default defineContentScript({
  matches: [...NETFLIX_MATCHES],
  main() {
    let options = DEFAULT_OPTIONS;
    const lastClicked = new WeakMap<Element, number>();
    let advanceLockedUntil = 0;

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

    /**
     * Avança uma única vez, no primeiro alvo visível da lista de prioridade.
     * Sem evento para o MAIN world: o clique já chega ao React e o handler lá
     * faria um segundo clique (a causa do pulo de episódio).
     */
    const advanceOnce = (selectors: readonly string[], lockMs = ADVANCE_LOCK_MS) => {
      const now = Date.now();
      if (now < advanceLockedUntil) return;
      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isClickable);
        if (!element) continue;
        if (now - (lastClicked.get(element) ?? 0) < 2_000) return;
        lastClicked.set(element, now);
        advanceLockedUntil = now + lockMs;
        element.click();
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        return;
      }
    };

    /**
     * O episódio corrente está no fim (ou já acabou)?
     * Sem elemento de vídeo (tela de detalhes, erro de player) devolve `true`
     * para não travar o avanço em telas onde a posição não existe.
     */
    const currentEpisodeIsEnding = (): boolean => {
      const video = document.querySelector<HTMLVideoElement>("video");
      if (!video) return true;
      const { duration, currentTime } = video;
      if (!Number.isFinite(duration) || duration <= 0) return true;
      return duration - currentTime <= END_OF_EPISODE_WINDOW_S;
    };

    const scan = () => {
      const targets: Array<{ selector: string; event?: string }> = [];
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

      // Ações de avanço: uma por vez, com trava e só no fim do episódio.
      if (options.autoPlayNext && currentEpisodeIsEnding()) {
        advanceOnce([
          '[data-uia="next-episode-seamless-button"]',
          '[aria-label^="Next episode"]',
          ".WatchNext-autoplay",
          ".WatchNext-still-hover-container",
          ".draining"
        ]);
      }
      if (options.watchCredits && currentEpisodeIsEnding()) {
        advanceOnce(['[data-uia^="watch-credits-seamless-button"]', '[aria-label^="Watch credits"]']);
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

function normalizeOptions(value: unknown): Options {
  return { ...DEFAULT_OPTIONS, ...(typeof value === "object" && value ? value : {}) };
}

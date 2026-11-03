import { NETFLIX_MATCHES } from "../netflix-matches";

export default defineContentScript({
  matches: [...NETFLIX_MATCHES],
  world: "MAIN",
  runAt: "document_start",
  main() {
    document.addEventListener("nen:activate", (event) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return;
      const element = event.target;
      event.preventDefault();

      // Some Netflix controls use onPointerDown instead of onClick. Choose one
      // native event, on the exact element selected by the isolated script. A
      // click plus pointerdown, a second lookup, or a retry can skip an episode.
      let usesPointerDown = false;
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const record = node as unknown as Record<string, unknown>;
        const propsKey = Object.keys(node).find((key) => key.startsWith("__reactProps$"));
        const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
        const fiber = fiberKey ? record[fiberKey] as { memoizedProps?: unknown } | undefined : undefined;
        const value = propsKey ? record[propsKey] : fiber?.memoizedProps;
        if (!value || typeof value !== "object") continue;
        const props = value as Record<string, unknown>;
        if (typeof props.onPointerDown === "function" || typeof props.onPointerDownCapture === "function") {
          usesPointerDown = true;
          break;
        }
        // A target's own click handler takes precedence over an ancestor's pointer handler.
        if (typeof props.onClick === "function" || typeof props.onClickCapture === "function") break;
      }
      if (usesPointerDown) {
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 }));
      } else {
        element.click();
      }
    });
  }
});

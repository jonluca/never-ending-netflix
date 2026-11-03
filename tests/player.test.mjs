import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const output = new URL("../.output/chrome-mv3/content-scripts/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../manifest.json", output), "utf8"));
const contentScript = await readFile(new URL("content.js", output), "utf8");
const mainScript = await readFile(new URL("player-main.js", output), "utf8");
const nextControls = '<button data-uia="next-episode-seamless-button"></button><button data-uia="next-episode-seamless-button-draining"></button><button class="WatchNext-autoplay"></button><button aria-label="Next episode"></button>';

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function player(t, { html = nextControls, options = {}, get, main = true, duration = 3600, currentTime = 3595, path = "/watch/123", video = true, setup } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${video ? "<video></video>" : ""}<div id="controls">${html}</div></body></html>`, {
    url: `https://www.netflix.com${path}`,
    runScripts: "outside-only"
  });
  const { window } = dom;
  const storageListeners = new Set();
  const writes = [];
  let now = 10_000;
  window.Date.now = () => now;
  window.HTMLElement.prototype.getClientRects = function () {
    return this.dataset.noRect ? [] : [{ width: 100, height: 40, top: 10, left: 10, right: 110, bottom: 50 }];
  };
  window.browser = {
    runtime: { id: "test-extension" },
    storage: {
      sync: { get: get ?? (async () => ({ options })), set: async (value) => writes.push(value) },
      onChanged: { addListener: (listener) => storageListeners.add(listener), removeListener: (listener) => storageListeners.delete(listener) }
    }
  };
  const media = window.document.querySelector("video");
  if (media) {
    Object.defineProperties(media, {
      duration: { value: duration, writable: true },
      currentTime: { value: currentTime, writable: true },
      ended: { value: false, writable: true }
    });
  }
  const ui = {
    window, media, writes,
    controls: window.document.querySelector("#controls"),
    tick: (ms) => { now += ms; },
    update: (value) => { for (const listener of storageListeners) listener({ options: { newValue: value } }, "sync"); },
    progress: (time, event = "timeupdate") => {
      media.currentTime = time;
      media.dispatchEvent(new window.Event(event));
    }
  };
  setup?.(ui);
  if (main) window.eval(mainScript);
  window.eval(contentScript);
  t.after(() => window.close());
  return ui;
}

function countEvents(ui, type = "click") {
  const events = [];
  ui.controls.addEventListener(type, (event) => events.push(event.target));
  return events;
}

test("one episode end activates only one target, even after controls remount past the cooldown", async (t) => {
  const ui = player(t);
  const clicks = countEvents(ui);
  await settle();
  assert.equal(clicks.length, 1);
  ui.tick(5_000);
  ui.controls.innerHTML = nextControls;
  await settle();
  ui.tick(10_000);
  ui.controls.innerHTML = nextControls;
  ui.progress(3599);
  await settle();
  assert.equal(clicks.length, 1, "A cooldown expiring must not rearm the same episode");
});

test("stale controls cannot skip a newly started episode, and the next actual end rearms", async (t) => {
  const ui = player(t);
  const clicks = countEvents(ui);
  await settle();
  assert.equal(clicks.length, 1);
  ui.progress(3, "loadedmetadata");
  ui.window.history.pushState({}, "", "/watch/124");
  ui.controls.innerHTML = nextControls;
  await settle();
  ui.tick(5_000);
  ui.controls.innerHTML = nextControls;
  ui.progress(8);
  await settle();
  assert.equal(clicks.length, 1);
  ui.progress(3595);
  await settle();
  assert.equal(clicks.length, 2);
});

test("non-bubbling media progress triggers autoplay without any DOM changes", async (t) => {
  const ui = player(t, { currentTime: 3580 });
  const clicks = countEvents(ui);
  await settle();
  assert.equal(clicks.length, 0);
  ui.progress(3591);
  await settle();
  assert.equal(clicks.length, 1);
});

test("missing, unknown, infinite and mid-episode media never authorize advancing", async (t) => {
  for (const media of [{ video: false }, { duration: NaN }, { duration: Infinity }, { duration: 0 }, { currentTime: 3 }]) {
    const ui = player(t, media);
    const clicks = countEvents(ui);
    await settle();
    assert.equal(clicks.length, 0, JSON.stringify(media));
  }
});

test("browse previews and unrelated draining buttons are never episode targets", async (t) => {
  for (const config of [{ path: "/browse" }, { html: '<button class="draining"></button>' }]) {
    const ui = player(t, config);
    const clicks = countEvents(ui);
    await settle();
    assert.equal(clicks.length, 0);
  }
});

test("hidden and disabled controls are skipped, while fixed-position visible controls work", async (t) => {
  const ui = player(t, { html: '<button data-uia="next-episode-seamless-button" style="visibility:hidden"></button><button data-uia="next-episode-seamless-button" disabled></button><div style="opacity:0"><button data-uia="next-episode-seamless-button"></button></div><button id="visible" data-uia="next-episode-seamless-button" style="position:fixed"></button>' });
  const clicks = countEvents(ui);
  await settle();
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].id, "visible");
  assert.equal(clicks[0].offsetParent, null);
});

test("an attribute-only visibility change makes the eligible control actionable", async (t) => {
  const ui = player(t, { html: '<button data-uia="next-episode-seamless-button" hidden></button>' });
  const clicks = countEvents(ui);
  await settle();
  assert.equal(clicks.length, 0);
  ui.controls.firstElementChild.hidden = false;
  await settle();
  assert.equal(clicks.length, 1);
});

test("React pointer controls receive one pointerdown and no duplicate click or delayed retry", async (t) => {
  let pointers = 0;
  const ui = player(t, { setup: ({ controls }) => {
    const button = controls.firstElementChild;
    button.__reactProps$test = { onPointerDown() {}, onClick() {} };
    button.addEventListener("pointerdown", () => { pointers++; });
  } });
  const clicks = countEvents(ui);
  await settle();
  ui.tick(5_000);
  ui.progress(3599);
  await settle();
  assert.equal(pointers, 1);
  assert.equal(clicks.length, 0);
});

test("the content script still clicks once if the MAIN bridge has not loaded", async (t) => {
  const ui = player(t, { main: false });
  const clicks = countEvents(ui);
  await settle();
  assert.equal(clicks.length, 1);
});

test("automation waits for settings and never rewrites them on page load", async (t) => {
  const stored = deferred();
  const ui = player(t, { get: () => stored.promise });
  const clicks = countEvents(ui);
  ui.controls.append(ui.window.document.createElement("span"));
  await settle();
  assert.equal(clicks.length, 0);
  stored.resolve({ options: { autoPlayNext: false } });
  await settle();
  assert.equal(clicks.length, 0);
  assert.equal(ui.writes.length, 0);
});

test("a newer settings event wins over an older in-flight settings read", async (t) => {
  const stored = deferred();
  const ui = player(t, { get: () => stored.promise });
  const clicks = countEvents(ui);
  ui.update({ autoPlayNext: false });
  stored.resolve({ options: { autoPlayNext: true } });
  await settle();
  assert.equal(clicks.length, 0);
  ui.update({ autoPlayNext: true });
  await settle();
  assert.equal(clicks.length, 1);
});

test("failed settings reads leave automation inactive", async (t) => {
  const ui = player(t, { get: async () => { throw new Error("unavailable"); } });
  const clicks = countEvents(ui);
  await settle();
  ui.progress(3599);
  await settle();
  assert.equal(clicks.length, 0);
});

test("watch credits acts when credits appear and wins over conflicting autoplay", async (t) => {
  const ui = player(t, { currentTime: 3400, options: { watchCredits: true, autoPlayNext: true }, html: nextControls + '<button id="credits" data-uia="watch-credits-seamless-button"></button>' });
  const clicks = countEvents(ui);
  await settle();
  assert.deepEqual(clicks.map((element) => element.id), ["credits"]);
  ui.progress(3598);
  await settle();
  assert.equal(clicks.length, 1);
});

test("the keep-player-maximized setting still activates the minimized player", async (t) => {
  const ui = player(t, { currentTime: 3400, options: { dontMinimzeEndCreditsOfShow: true }, html: '<div class="watch-video--player-view-minimized"><div id="maximize"></div></div>' });
  const clicks = countEvents(ui);
  await settle();
  assert.deepEqual(clicks.map((element) => element.id), ["maximize"]);
});

test("hiding options restore previous inline styles immediately when switched off", async (t) => {
  const ui = player(t, { path: "/browse", html: '<div class="billboard-row" style="display:grid !important"></div><div class="slider-item"><div class="is-disliked"></div></div>', options: { disableAutoPlayOnBrowse: true, hideDisliked: true } });
  await settle();
  const billboard = ui.controls.querySelector(".billboard-row");
  const card = ui.controls.querySelector(".slider-item");
  assert.equal(billboard.style.display, "none");
  assert.equal(card.style.display, "none");
  ui.update({ disableAutoPlayOnBrowse: false, hideDisliked: false });
  await settle();
  assert.equal(billboard.style.display, "grid");
  assert.equal(billboard.style.getPropertyPriority("display"), "important");
  assert.equal(card.style.display, "");
});

test("disliked cards are restored in search and when their dislike class is removed", async (t) => {
  const ui = player(t, { path: "/browse", html: '<div class="slider-item"><div class="is-disliked"></div></div>', options: { hideDisliked: true } });
  await settle();
  const card = ui.controls.querySelector(".slider-item");
  assert.equal(card.style.display, "none");
  ui.window.history.pushState({}, "", "/search?q=show");
  ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate"));
  await settle();
  assert.equal(card.style.display, "");
  ui.window.history.pushState({}, "", "/browse");
  ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate"));
  await settle();
  assert.equal(card.style.display, "none");
  card.firstElementChild.classList.remove("is-disliked");
  await settle();
  assert.equal(card.style.display, "");
});


test("the MAIN bridge is installed at document_start before the isolated content script", () => {
  const bridge = manifest.content_scripts.find((script) => script.world === "MAIN");
  const isolated = manifest.content_scripts.find((script) => script.world !== "MAIN");
  assert.equal(bridge.run_at, "document_start");
  assert.notEqual(isolated.run_at, "document_start");
});

test("a target nested inside a React pointer-only control bubbles one activation to its parent", async (t) => {
  let pointers = 0;
  const ui = player(t, { html: '<button><span data-uia="next-episode-seamless-button"></span></button>', setup: ({ controls }) => {
    const button = controls.firstElementChild;
    button.__reactProps$test = { onPointerDown() {} };
    button.addEventListener("pointerdown", () => { pointers++; });
  } });
  const clicks = countEvents(ui);
  await settle();
  assert.equal(pointers, 1);
  assert.equal(clicks.length, 0);
});

test("a target's own React click handler takes priority over an ancestor pointer handler", async (t) => {
  let pointers = 0;
  const ui = player(t, { html: '<div><button data-uia="next-episode-seamless-button"></button></div>', setup: ({ controls }) => {
    const parent = controls.firstElementChild;
    parent.__reactProps$test = { onPointerDown() {} };
    parent.firstElementChild.__reactProps$test = { onClick() {} };
    parent.addEventListener("pointerdown", () => { pointers++; });
  } });
  const clicks = countEvents(ui);
  await settle();
  assert.equal(pointers, 0);
  assert.equal(clicks.length, 1);
});

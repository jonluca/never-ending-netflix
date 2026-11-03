import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const output = new URL("../.output/chrome-mv3/", import.meta.url);
const html = await readFile(new URL("popup.html", output), "utf8");
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.ok(scriptPath, "The Chrome build must contain the popup script");
const script = await readFile(new URL(scriptPath.replace(/^\//, ""), output), "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function popup(t, { get = async () => ({}), set = async () => {}, fetch = async () => ({ ok: true, json: async () => [] }) } = {}) {
  const dom = new JSDOM(html, { url: "https://extension.test/popup.html", runScripts: "outside-only" });
  const { window } = dom;
  const writes = [];
  window.browser = {
    runtime: { id: "test-extension", getURL: (path) => `https://extension.test${path}` },
    i18n: { getMessage: () => "" },
    storage: { sync: { get, set: async (value) => { writes.push(structuredClone(value)); await set(value); } } }
  };
  window.fetch = fetch;
  window.eval(script);
  t.after(() => window.close());
  return {
    window,
    writes,
    option: (name) => window.document.querySelector(`[data-option="${name}"]`),
    status: () => window.document.querySelector("#settings-status").textContent
  };
}

test("saved preferences load before settings can be changed, without waiting for genres", async (t) => {
  const stored = deferred();
  const catalog = deferred();
  const ui = popup(t, { get: () => stored.promise, fetch: () => catalog.promise });
  assert.equal(ui.option("autoPlayNext").disabled, true);
  ui.option("autoPlayNext").click();
  assert.equal(ui.writes.length, 0);

  stored.resolve({ options: { autoPlayNext: false, skipStillHere: false, highContrast: true } });
  await settle();
  assert.equal(ui.option("autoPlayNext").disabled, false);
  assert.equal(ui.option("autoPlayNext").checked, false);
  assert.equal(ui.option("skipStillHere").checked, false);
  assert.equal(ui.window.document.documentElement.classList.contains("high-contrast"), true);
  assert.equal(ui.window.document.querySelector("#contrast").getAttribute("aria-pressed"), "true");
  assert.equal(ui.writes.length, 0, "Opening the popup must not overwrite saved preferences");
});

test("invalid stored values fall back to defaults and watching credits wins conflicting modes", async (t) => {
  const ui = popup(t, { get: async () => ({ options: { skipStillHere: "false", skipTitleSequence: null, autoPlayNext: true, watchCredits: true } }) });
  await settle();
  assert.equal(ui.option("skipStillHere").checked, true);
  assert.equal(ui.option("skipTitleSequence").checked, true);
  assert.equal(ui.option("watchCredits").checked, true);
  assert.equal(ui.option("autoPlayNext").checked, false);

  ui.option("autoPlayNext").click();
  await settle();
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.writes[0].options.autoPlayNext, true);
  assert.equal(ui.writes[0].options.watchCredits, false);
});

test("a failed settings read keeps controls disabled and does not replace preferences", async (t) => {
  const ui = popup(t, { get: async () => { throw new Error("storage unavailable"); } });
  await settle();
  assert.equal(ui.option("autoPlayNext").disabled, true);
  assert.match(ui.status(), /Unable to load settings/);
  ui.option("autoPlayNext").click();
  assert.equal(ui.writes.length, 0);
});

test("a failed settings save restores the last saved values and allows retry", async (t) => {
  const pendingSave = deferred();
  const ui = popup(t, { get: async () => ({ options: { autoPlayNext: false } }), set: () => pendingSave.promise });
  await settle();
  ui.option("autoPlayNext").click();
  assert.equal(ui.option("autoPlayNext").checked, true);
  assert.equal(ui.option("autoPlayNext").disabled, true);
  pendingSave.reject(new Error("sync quota exceeded"));
  await settle();
  assert.equal(ui.option("autoPlayNext").checked, false);
  assert.equal(ui.option("autoPlayNext").disabled, false);
  assert.match(ui.status(), /Unable to save settings/);
});

test("a query entered while the genre catalog loads is rendered once it arrives", async (t) => {
  const catalog = deferred();
  const ui = popup(t, { fetch: () => catalog.promise });
  const search = ui.window.document.querySelector("#genre-search");
  search.value = "action";
  search.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  catalog.resolve({ ok: true, json: async () => [{ genre: "Action & Adventure", link: "http://www.netflix.com/browse/genre/1365" }] });
  await settle();
  const link = ui.window.document.querySelector("#results a");
  assert.equal(link.textContent, "Action & Adventure");
  assert.equal(link.href, "https://www.netflix.com/browse/genre/1365");
  assert.equal(link.target, "_blank");
});

test("a failed genre catalog does not disable saved settings", async (t) => {
  const ui = popup(t, { fetch: async () => ({ ok: false }) });
  await settle();
  assert.equal(ui.option("autoPlayNext").disabled, false);
  assert.match(ui.window.document.querySelector("#genre-status").textContent, /Unable to load genres/);
});

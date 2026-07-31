import "./style.css";

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
type Genre = { genre: string; link: string };

const defaults: Options = {
  skipStillHere: true,
  autoPlayNext: true,
  watchCredits: false,
  skipTitleSequence: true,
  disableAutoPlayOnBrowse: false,
  dontMinimzeEndCreditsOfShow: false,
  hideDisliked: false,
  highContrast: false
};
let options = defaults;
let genres: Genre[] = [];

function localize(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n as Parameters<typeof browser.i18n.getMessage>[0] | undefined;
    const message = key ? browser.i18n.getMessage(key) : "";
    if (message) element.textContent = message;
  }
  for (const element of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    const key = element.dataset.i18nPlaceholder as Parameters<typeof browser.i18n.getMessage>[0] | undefined;
    const message = key ? browser.i18n.getMessage(key) : "";
    if (message) element.placeholder = message;
  }
}

async function save(): Promise<void> {
  await browser.storage.sync.set({ options });
  await browser.runtime.sendMessage({ action: "optionsChanged", options }).catch(() => undefined);
}

function render(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-option]")) {
    const key = input.dataset.option as keyof Options;
    input.checked = Boolean(options[key]);
  }
  document.documentElement.classList.toggle("high-contrast", options.highContrast);
}

function renderResults(query: string): void {
  const container = document.querySelector<HTMLElement>("#results")!;
  container.replaceChildren();
  if (!query.trim()) return;

  const normalized = query.trim().toLowerCase();
  const matches = genres
    .filter(({ genre }) => genre.toLowerCase().includes(normalized))
    .sort((a, b) => Number(b.genre.toLowerCase().startsWith(normalized)) - Number(a.genre.toLowerCase().startsWith(normalized)))
    .slice(0, 100);
  for (const genre of matches) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = genre.genre;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void browser.tabs.create({ url: genre.link.replace(/^http:/, "https:") });
    });
    container.append(link);
  }
}

document.querySelector("#options")?.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.option) return;
  const key = input.dataset.option as keyof Options;
  (options[key] as boolean) = input.checked;
  if (key === "autoPlayNext" && input.checked) options.watchCredits = false;
  if (key === "watchCredits" && input.checked) options.autoPlayNext = false;
  render();
  void save();
});
document.querySelector("#genre-search")?.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement) renderResults(event.target.value);
});
document.querySelector("#contrast")?.addEventListener("click", () => {
  options.highContrast = !options.highContrast;
  render();
  void save();
});
document.querySelector("[data-url]")?.addEventListener("click", (event) => {
  event.preventDefault();
  const url = (event.currentTarget as HTMLElement).dataset.url;
  if (url) void browser.tabs.create({ url });
});

localize();
const stored = await browser.storage.sync.get("options");
options = { ...defaults, ...(typeof stored.options === "object" ? stored.options : {}) };
genres = (await fetch(browser.runtime.getURL("/data/genres.json")).then((response) => response.json())) as Genre[];
render();

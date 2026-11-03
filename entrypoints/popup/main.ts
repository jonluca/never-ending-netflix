import "./style.css";
import { DEFAULT_OPTIONS, normalizeOptions, type Options } from "../../options";
type Genre = { genre: string; link: string };

let options = { ...DEFAULT_OPTIONS };
let optionsLoaded = false;
let saving = false;
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

function showStatus(message: string): void {
  document.querySelector<HTMLElement>("#settings-status")!.textContent = message;
}

async function save(next: Options): Promise<void> {
  const previous = options;
  options = next;
  saving = true;
  showStatus("");
  render();
  try {
    // Storage changes also notify the content scripts in every open Netflix tab.
    await browser.storage.sync.set({ options: next });
  } catch {
    options = previous;
    showStatus("Unable to save settings. Please try again.");
  } finally {
    saving = false;
    render();
  }
}

function render(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-option]")) {
    const key = input.dataset.option as keyof Options;
    input.checked = Boolean(options[key]);
    input.disabled = !optionsLoaded || saving;
  }
  const contrast = document.querySelector<HTMLButtonElement>("#contrast")!;
  contrast.disabled = !optionsLoaded || saving;
  contrast.setAttribute("aria-pressed", String(options.highContrast));
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
    link.href = genre.link.replace(/^http:/, "https:");
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = genre.genre;
    container.append(link);
  }
}

document.querySelector("#options")?.addEventListener("change", (event) => {
  const input = event.target;
  if (!optionsLoaded || saving || !(input instanceof HTMLInputElement) || !input.dataset.option) return;
  const key = input.dataset.option as keyof Options;
  if (!(key in DEFAULT_OPTIONS)) return;
  const next = { ...options, [key]: input.checked };
  if (key === "autoPlayNext" && input.checked) next.watchCredits = false;
  if (key === "watchCredits" && input.checked) next.autoPlayNext = false;
  void save(next);
});
document.querySelector("#genre-search")?.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement) renderResults(event.target.value);
});
document.querySelector("#contrast")?.addEventListener("click", () => {
  if (!optionsLoaded || saving) return;
  void save({ ...options, highContrast: !options.highContrast });
});

localize();
render();

async function loadOptions(): Promise<void> {
  try {
    const stored = await browser.storage.sync.get("options");
    options = normalizeOptions(stored.options);
    optionsLoaded = true;
    render();
  } catch {
    showStatus("Unable to load settings. Reopen the popup to try again.");
  }
}

async function loadGenres(): Promise<void> {
  try {
    const response = await fetch(browser.runtime.getURL("/data/genres.json"));
    if (!response.ok) throw new Error("Genre catalog unavailable");
    genres = (await response.json()) as Genre[];
    renderResults(document.querySelector<HTMLInputElement>("#genre-search")!.value);
  } catch {
    document.querySelector<HTMLElement>("#genre-status")!.textContent = "Unable to load genres. Reopen the popup to try again.";
  }
}

void loadOptions();
void loadGenres();

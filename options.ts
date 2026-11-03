export type Options = {
  skipStillHere: boolean;
  autoPlayNext: boolean;
  watchCredits: boolean;
  skipTitleSequence: boolean;
  disableAutoPlayOnBrowse: boolean;
  dontMinimzeEndCreditsOfShow: boolean;
  hideDisliked: boolean;
  highContrast: boolean;
};

export const DEFAULT_OPTIONS: Readonly<Options> = Object.freeze({
  skipStillHere: true,
  autoPlayNext: true,
  watchCredits: false,
  skipTitleSequence: true,
  disableAutoPlayOnBrowse: false,
  dontMinimzeEndCreditsOfShow: false,
  hideDisliked: false,
  highContrast: false
});

export function normalizeOptions(value: unknown): Options {
  const options = { ...DEFAULT_OPTIONS };
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(DEFAULT_OPTIONS) as Array<keyof Options>) {
      const stored = (value as Record<string, unknown>)[key];
      if (typeof stored === "boolean") options[key] = stored;
    }
  }
  // Older versions and synced settings can contain both mutually exclusive modes.
  if (options.watchCredits) options.autoPlayNext = false;
  return options;
}

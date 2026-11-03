# Never Ending Netflix

Chrome extension that skips intros, continues playback, and provides genre search on Netflix.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/hdadmgabliibighlbejhlglfjgplfmhb).

## Development

Use the Node version in `.nvmrc` and the npm version in `package.json`.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run lint:firefox
```

`npm test` builds the Chrome extension and runs regression tests against the compiled content scripts and popup. These tests simulate Netflix's player and DOM; live Netflix playback should also be checked when changing player behavior.

WXT builds Manifest V3 packages from `entrypoints/`, `wxt.config.ts`, and the assets in `public/`. The root-level `manifest.json`, `NEN.js`, `js/`, `html/`, and `css/` are historical sources and are not included in the WXT release. Bundled legacy libraries and remote popup fonts are not shipped.

## Chrome release

The extension version comes from `package.json`. Update it with `npm version patch --no-git-tag-version`, then run the checks above and:

```sh
npm run zip
```

Upload `.output/never-ending-netflix-<version>-chrome.zip` to the existing Chrome Web Store item `hdadmgabliibighlbejhlglfjgplfmhb`. For local testing, load `.output/chrome-mv3` as an unpacked extension in `chrome://extensions` and disable the installed store version to avoid running both copies.

All npm dependencies are development tools. The current dependency audit has no production findings; remaining build-tool advisories require upstream fixes or API migrations and are not included in the extension bundle.

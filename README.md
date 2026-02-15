# YouTube Subtitle Mixer Extension

A Manifest v3 Chrome extension that runs on YouTube watch pages and randomly swaps about 5–10% of subtitle words with translated words in your selected target language.

## Features

- Works only on `https://www.youtube.com/watch*` pages.
- Detects subtitle updates in real time using `MutationObserver`.
- Randomly replaces a small subset (5–10%) of subtitle words.
- Popup UI to choose a target language.
- Persists language preference via Chrome storage (`chrome.storage.sync`).
- Uses free LibreTranslate public API (no API key required).
- Includes request throttling, batching, and local cache to reduce API calls.

## Install as an Unpacked Extension

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.
6. Open any YouTube video page with subtitles enabled.

## Change the Target Language

1. Click the extension icon in Chrome.
2. In the popup, choose a language from the dropdown.
3. The new language is saved automatically.
4. Return to the YouTube tab; new subtitle updates use the selected language.

## Free API Usage (LibreTranslate)

This extension calls the public LibreTranslate instance:

- Endpoint: `https://libretranslate.de/translate`
- Method: `POST`
- Body params:
  - `q`: text to translate (batched words joined by newlines)
  - `source`: `auto`
  - `target`: selected language code
  - `format`: `text`

No API key is required.

## Rate Limit and Reliability Notes

Because this uses a public free instance:

- You may occasionally see slow responses.
- You may hit temporary rate limits if traffic is high.
- The extension reduces request volume using:
  - basic request interval throttling,
  - batching multiple words per request,
  - in-memory cache of previously translated words.

## Self-Host LibreTranslate (Recommended for Unlimited/Private Usage)

To avoid public API limits, run LibreTranslate locally.

### Quick Docker example

```bash
docker run -d -p 5000:5000 libretranslate/libretranslate
```

Then update `API_ENDPOINT` in `content.js` to:

```js
const API_ENDPOINT = "http://localhost:5000/translate";
```

Reload the extension in `chrome://extensions` after the change.

---

This project is for educational and personal-use experimentation.

# YouTube Subtitle Mixer Extension

A Manifest v3 Chrome extension that runs on YouTube watch pages and randomly swaps about 8–16% of subtitle words with translated words in your selected target language.

## Features

- Works only on `https://www.youtube.com/watch*` pages.
- Detects subtitle updates in real time using `MutationObserver`.
- Randomly replaces a small subset of subtitle words.
- Popup UI to choose a target language.
- Persists language preference via Chrome storage (`chrome.storage.sync`).
- Uses a background service worker for translation requests (avoids CORS issues from content scripts).
- Uses provider fallback:
  - Primary: LibreTranslate public API.
  - Secondary fallback: MyMemory API.
  - Tertiary fallback: Google Translate endpoint.
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

## Translation APIs

This extension calls the following free public services from the extension service worker:

- `https://libretranslate.de/translate`
- `https://api.mymemory.translated.net/get`
- `https://translate.googleapis.com/translate_a/single`

If LibreTranslate fails, the extension falls back to MyMemory, then Google Translate.

## Reliability Notes

Because this uses public free instances:

- You may occasionally see slow responses.
- You may hit temporary rate limits if traffic is high.

The extension reduces request volume using:

- basic request interval throttling,
- batching multiple words per request,
- in-memory cache of previously translated words.

---

This project is for educational and personal-use experimentation.

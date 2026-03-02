# 🎧 Lingo Stream

A Chrome extension that helps users learn a foreign language by replacing a small percentage of YouTube subtitles with translated words.

Example:

Original:
"I really enjoy learning new skills every day."

Lingo Stream Output (Spanish 5%):
"I really enjoy learning new skills (habilidades) every day."

---

## 🚀 Features (MVP)

- Detects YouTube auto-generated subtitles
- Replaces ~5% of meaningful words
- Filters out stop words (is, are, a, the, etc.)
- Uses free public translation endpoints (no API key required)
- User selects target language
- Adjustable replacement percentage
- Real-time subtitle modification using MutationObserver

---

## 🏗 Architecture

Chrome Extension (Manifest V3)

Files:

/extension
- manifest.json
- content.js
- popup.html
- popup.js
- stopwords.js

---

## 🧠 How It Works

1. The extension observes YouTube's subtitle DOM elements:
   `.ytp-caption-segment`

2. When new subtitles appear:
   - Text is split into words
   - Stop words are filtered out
   - A percentage of remaining words are selected
   - Words are translated via API
   - Modified text is re-rendered

---

## 🔑 API

This extension uses free public translation providers and does not require API keys, billing, or self-hosting.

- LibreTranslate public mirror: `https://translate.cutie.dating/translate`
- Lingva Translate proxy: `https://lingva.ml/api/v1/{source}/{target}/{text}`

Users can choose their provider in the popup and the extension falls back to the other provider if the selected one is unavailable.

---

## ⚠️ Known Limitations

- API calls are not yet cached
- May translate the same word multiple times
- No grammar awareness
- No vocabulary tracking
- No batching of translation requests
- No rate limiting handling

---

## 🛠 Future Improvements

- Add translation caching
- Add hover tooltip instead of inline replacement
- Batch API requests
- Word frequency tracking
- Difficulty levels (A1–C2)
- Vocabulary saving
- Dashboard page
- Performance optimization
- Dark mode UI

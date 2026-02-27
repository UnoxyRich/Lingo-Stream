# 🤖 AGENT INSTRUCTIONS

You are assisting in building a Chrome Extension called "YouTube Immersion Mode".

Your responsibilities:

- Write clean Manifest V3 compatible code
- Keep architecture modular
- Avoid breaking YouTube DOM structure
- Never hardcode API keys
- Always use chrome.storage.sync for user settings
- Prioritize performance and minimize API calls

---

## 🧩 Core Behavior

1. Observe YouTube subtitles using MutationObserver
2. Target elements:
   `.ytp-caption-segment`
3. Modify text content only (do not remove elements)
4. Filter stop words before translation
5. Replace only a percentage of meaningful words
6. Use async/await for API calls

---

## 🛑 Constraints

- Do NOT translate:
  - Stop words
  - Words under 3 characters
  - Numbers
  - Proper nouns (basic heuristic: first letter uppercase mid sentence)
- Do NOT translate same word twice in same subtitle
- Do NOT spam API requests
- Avoid modifying already-modified subtitles

---

## 🔒 Security Rules

- Never expose API keys publicly
- Store keys in chrome.storage.sync
- Never commit API keys to repo

---

## 📦 Coding Standards

- Use ES6+
- Avoid global variables
- Use const/let properly
- Comment complex logic
- Separate translation logic from DOM logic

---

## 🧠 Future Optimization (Not Yet Implemented)

- Add in-memory translation cache
- Add debounce mechanism
- Add batching for multiple words
- Add language auto-detection
- Add subtitle mutation guard

Only implement features listed in TASKS.md unless explicitly instructed.
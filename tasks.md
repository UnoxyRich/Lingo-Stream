# 📋 PROJECT TASK TRACKER

## 🟢 PROJECT STATUS

Current State:
- [x] README.md created
- [x] AGENT.md created
- [x] TASKS.md created

⚠️ Only documentation files are complete.  
All functional code has not been started.

---

# 🎯 DEVELOPMENT ROADMAP

---

# PHASE 1 — FOUNDATION (MVP CORE)

## 1️⃣ manifest.json

### Goals
- [ ] Create Manifest V3 configuration
- [ ] Add required permissions:
  - [ ] storage
  - [ ] activeTab
  - [ ] scripting
- [ ] Add host_permissions:
  - [ ] https://www.youtube.com/*
  - [ ] Translation API domain
- [ ] Configure popup (action → popup.html)
- [ ] Configure content script injection on YouTube

### Success Criteria
- [ ] Extension loads without errors
- [ ] Popup opens correctly
- [ ] No permission warnings

---

## 2️⃣ Popup UI (popup.html, popup.js, styles.css)

### UI Components
- [ ] API Key input field
- [ ] Target language dropdown
- [ ] Replacement percentage slider (1–20%)
- [ ] Enable / Disable toggle
- [ ] Save button

### Storage Logic
- [ ] Store settings in chrome.storage.sync
- [ ] Load stored settings on popup open
- [ ] Persist settings across browser restarts

### Success Criteria
- [ ] Settings persist correctly
- [ ] No console errors
- [ ] UI reflects saved values

---

# PHASE 2 — SUBTITLE DETECTION

## 3️⃣ content.js — Detect YouTube Subtitles

### Implementation
- [ ] Use MutationObserver
- [ ] Observe document.body
- [ ] Detect `.ytp-caption-segment`
- [ ] Extract node.textContent
- [ ] Ensure no DOM structure is broken

### Edge Cases
- [ ] Works when switching videos
- [ ] Handles auto-generated subtitles
- [ ] Does not crash if subtitles disabled

### Success Criteria
- [ ] Subtitle text logs in real time
- [ ] Works consistently across videos

---

# PHASE 3 — WORD PROCESSING LOGIC

## 4️⃣ Stop Word Filtering (stopwords.js)

### Must Filter
- [ ] Articles (a, an, the)
- [ ] Auxiliary verbs (is, are, was)
- [ ] Pronouns (I, you, he, she, etc.)
- [ ] Prepositions (in, on, at, to)
- [ ] Words under 3 characters
- [ ] Numbers
- [ ] Pure punctuation

### Additional Filtering
- [ ] Avoid translating capitalized proper nouns
- [ ] Avoid duplicate translation in same subtitle

### Success Criteria
- [ ] Meaningless words never translated
- [ ] Subtitles remain readable

---

## 5️⃣ Percentage Replacement Logic

### Algorithm Steps
- [ ] Split subtitle into words
- [ ] Filter stop words
- [ ] Calculate replacement count
- [ ] Randomly select unique words
- [ ] Translate selected words
- [ ] Replace words safely

### Display Mode (Choose One)
- [ ] Replace word completely
- [ ] Show word (translation)  ← Recommended

### Success Criteria
- [ ] Correct percentage replaced
- [ ] No duplicate replacements
- [ ] No visual glitches

---

# PHASE 4 — TRANSLATION API

## 6️⃣ Translation Integration

### Requirements
- [ ] Use async/await
- [ ] Pull API key from chrome.storage
- [ ] Handle API errors gracefully
- [ ] Prevent crashes on API failure

### MVP Limitations (Accepted)
- [ ] No batching
- [ ] No caching yet
- [ ] Possible repeated translations

### Success Criteria
- [ ] Words translate correctly
- [ ] Extension remains responsive

---

# PHASE 5 — STABILITY IMPROVEMENTS

## 7️⃣ Prevent Duplicate Processing

### Tasks
- [ ] Add dataset flag to processed nodes
- [ ] Skip already-processed subtitles
- [ ] Prevent flickering

### Success Criteria
- [ ] No repeated translations
- [ ] Smooth subtitle updates

---

# PHASE 6 — PERFORMANCE OPTIMIZATION (POST-MVP)

## 8️⃣ Add Translation Cache

- [ ] Create in-memory cache object
- [ ] Check cache before API call
- [ ] Store translation results
- [ ] Reduce duplicate API requests

---

## 9️⃣ Add Debounce Mechanism

- [ ] Add delay before processing subtitles
- [ ] Prevent rapid API firing
- [ ] Improve performance on fast subtitle updates

---

# 🔮 FUTURE FEATURES

## Learning Enhancements
- [ ] Hover tooltip mode
- [ ] Click word → save vocabulary
- [ ] Word frequency tracking
- [ ] Difficulty filtering (A1–C2)
- [ ] Grammar-aware translation

## UX Improvements
- [ ] Dark mode
- [ ] Highlight styling
- [ ] Immersion intensity presets
- [ ] Onboarding tutorial

## Monetization Layer
- [ ] Free tier limit (5%)
- [ ] Pro unlock higher percentage
- [ ] Subscription model
- [ ] User accounts
- [ ] Analytics dashboard

---

# 🏁 MVP DEFINITION

The MVP is complete when:

- [ ] Extension installs successfully
- [ ] Popup settings persist
- [ ] Subtitles are detected reliably
- [ ] 5% of meaningful words are translated
- [ ] No major performance issues
- [ ] No DOM breakage
- [ ] Works across multiple YouTube videos

---

# 📌 CURRENT PRIORITY

- [ ] Build manifest.json
- [ ] Build content.js with subtitle detection
- [ ] Implement stop-word filtering
- [ ] Connect translation API
- [ ] Add simple translation cache
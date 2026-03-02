# PROJECT TASK TRACKER

## Current Status
- [x] Manifest V3 extension scaffolded and validated
- [x] Popup settings UI wired to `chrome.storage.sync`
- [x] Subtitle observation + mutation handling implemented
- [x] Stopword and token filtering logic implemented
- [x] Percentage-based replacement logic implemented
- [x] Translation bridge implemented with provider fallback
- [x] Translation cache + miss cache implemented
- [x] Debounce and duplicate-processing guards implemented
- [x] Debug logging panel implemented and always visible in popup
- [x] Background diagnostics logging added for translation flow

## Completed In This Fix
- [x] Added safer sender trust fallback for content-script messages with missing URL metadata
- [x] Added `google` provider support and included it in auto fallback order
- [x] Added `https://translate.googleapis.com/*` permission
- [x] Broadened YouTube URL matching to `https://*.youtube.com/*`
- [x] Added tests for internal sender fallback and Google provider parsing

## Remaining TODO
- [ ] Add integration/e2e test that simulates caption DOM updates end-to-end
- [ ] Add explicit in-popup health check (content script attached + last translation success)
- [ ] Add backoff/rate-limit handling for provider throttling
- [ ] Add optional vocabulary save/export workflow

## Definition of Done (MVP)
- [x] Extension installs successfully
- [x] Popup settings persist
- [x] Subtitles are detected and processed
- [x] Meaningful words are translated inline with fallback providers
- [x] No major build/test failures
- [x] No DOM element replacement (text-only mutation)

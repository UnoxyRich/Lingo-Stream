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
- [x] Vocabulary quiz page implemented with recent-word matching rounds
- [x] Quiz interaction refined to fixed 5-word rounds with clearer UX states
- [x] Documentation site updated with current release download + install information
- [x] Vocabulary import workflow added (CSV/JSON)
- [x] Quiz progression buckets added: not quizzed, answered correctly, answered incorrectly
- [x] Randomized quiz selection updated to use not quizzed + low-probability incorrect words
- [x] Nightly CI workflow added for fixture-based extension E2E smoke tests
- [x] Vocabulary filters added in popup (text + language + provider + date range)
- [x] UX polish added for vocabulary badges and export confirmation states

## Completed In v1.0.0 Release
- [x] Added safer sender trust fallback for content-script messages with missing URL metadata
- [x] Added `google` provider support and included it in auto fallback order
- [x] Added `https://translate.googleapis.com/*` permission
- [x] Broadened YouTube URL matching to `https://*.youtube.com/*`
- [x] Added tests for internal sender fallback and Google provider parsing
- [x] Added integration/e2e test that simulates caption DOM updates end-to-end
- [x] Added explicit popup health checks for content-script connection and last translation success
- [x] Added optional vocabulary save/export workflow (toggle + CSV export + clear)
- [x] Added translation health + vocabulary persistence tests
- [x] Added dedicated quiz page + popup launch flow for quick vocabulary review
- [x] Updated quiz UI to Duolingo-like interaction cues and completion states
- [x] Published release package `Lingo.Stream.1.0.0.Release.zip`

## Remaining TODO (Near Term)
- [ ] Add backoff/rate-limit handling for provider throttling
- [ ] Add last-translation failure diagnostics in popup health panel (error + provider fallback trace)

## Future TODO (Planned)

## Definition of Done (MVP)
- [x] Extension installs successfully
- [x] Popup settings persist
- [x] Subtitles are detected and processed
- [x] Meaningful words are translated inline with fallback providers
- [x] No major build/test failures
- [x] No DOM element replacement (text-only mutation)

# Lingo Stream

Lingo Stream is a Chrome Extension (Manifest V3) that helps with language immersion on YouTube by replacing a small percentage of caption words with inline translations.

Example:

Original:
`I really enjoy learning new skills every day.`

Lingo Stream output (Spanish):
`I really enjoy (gusto) learning new skills every day.`

## What It Does

- Observes YouTube caption updates in real time
- Filters low-value tokens (stop words, short words, numbers)
- Replaces a configurable percentage of meaningful words
- Uses free translation providers with fallback support
- Caches translation hits and misses to reduce repeated requests
- Includes popup health checks:
  - content script connection status
  - last translation success timestamp/provider/count
- Supports optional vocabulary saving and CSV export
- Includes debug logs in popup for troubleshooting

## Supported Translation Providers

- Google endpoint (`translate.googleapis.com`)
- LibreTranslate public mirrors
- Apertium APY
- MyMemory
- `auto` mode tries multiple providers and uses the first successful result

## Supported Target Languages (Popup)

- Spanish (`es`)
- French (`fr`)
- German (`de`)
- Italian (`it`)
- Portuguese (`pt`)
- Japanese (`ja`)
- Korean (`ko`)
- Chinese (`zh`)
- Russian (`ru`)
- Arabic (`ar`)
- Hindi (`hi`)
- Turkish (`tr`)
- Dutch (`nl`)
- Swedish (`sv`)
- Polish (`pl`)
- Ukrainian (`uk`)
- Vietnamese (`vi`)

## Install (Unpacked Extension)

1. Install dependencies:
   `npm install`
2. Run checks:
   `npm run build`
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the `extension/` folder

## Usage

1. Open a YouTube video with captions enabled.
2. Open the extension popup.
3. Configure:
   - translation provider
   - target language
   - replacement percentage
   - enable/disable extension
   - optional vocabulary saving
4. Click **Save Settings**.
5. If needed, click **Refresh Captions**.
6. Use **Recheck Health** in the popup to verify runtime status.
7. Use **Export Vocabulary** to download saved entries as CSV.

## Development

### Scripts

- `npm run lint` - run ESLint
- `npm test` - run Vitest suite
- `npm run test:coverage` - run tests with coverage
- `npm run validate:manifest` - validate manifest structure
- `npm run build` - sync assets + build checks
- `npm run ci` - lint + manifest validation + coverage + build

### Project Structure

- `extension/` - Chrome extension runtime files
  - `content.js` - content entrypoint and observer wiring
  - `captionObserver.js` - mutation processing pipeline
  - `processor.js` - token selection and inline rendering
  - `translation.js` - bridge client, cache, vocabulary persistence
  - `background.js` - provider bridge and sender validation
  - `popup.html` / `popup.js` - settings, health, export UI
- `tests/` - unit and integration tests
- `scripts/` - validation/build helper scripts
- `docs/` - project website/docs assets

## Testing

The suite includes:

- Unit tests for processor, stopwords, translation bridge, and background logic
- Content bundle load test to ensure script compatibility in manifest order
- End-to-end integration test that simulates caption DOM mutation updates

Run all tests:

`npm test`

## Data and Privacy

- Settings are stored in `chrome.storage.sync`
- Debug logs, health metadata, and optional vocabulary entries are stored in `chrome.storage.local`
- No API keys are required for default providers

## Current Limitations

- Public translation endpoints may rate-limit or throttle
- Quality and availability depend on third-party services
- Inline translation format is optimized for speed, not grammar correctness

## Roadmap

- Vocabulary import workflow (CSV/JSON)
- Vocabulary filtering/search in popup
- Better provider throttling/backoff handling
- Richer health diagnostics for translation failures
- CI smoke checks for YouTube caption fixtures

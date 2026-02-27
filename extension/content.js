import { createCaptionMutationHandler } from './captionObserver.js';
import { buildImmersiveSubtitle } from './processor.js';
import { translateWords } from './translation.js';

const DEFAULT_REPLACEMENT_PERCENTAGE = 5;

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabled', 'replacementPercentage'], (items) => {
      resolve({
        enabled: items.enabled ?? true,
        replacementPercentage: items.replacementPercentage ?? DEFAULT_REPLACEMENT_PERCENTAGE
      });
    });
  });
}

const handler = createCaptionMutationHandler({
  getSettings,
  transformSubtitle: (subtitleText, replacementPercentage) =>
    buildImmersiveSubtitle(subtitleText, translateWords, replacementPercentage),
  debounceMs: 200
});

const observer = new MutationObserver((mutations) => {
  handler.handleMutations(mutations);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

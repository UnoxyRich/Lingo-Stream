import { createCaptionMutationHandler } from './captionObserver.js';
import { buildImmersiveSubtitle } from './processor.js';
import { translateWords } from './translation.js';

const DEFAULT_REPLACEMENT_PERCENTAGE = 5;

console.log('YouTube Immersion Mode loaded');

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabled', 'replacementPercentage'], (items) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to read content settings from storage.', chrome.runtime.lastError);
        resolve({
          enabled: true,
          replacementPercentage: DEFAULT_REPLACEMENT_PERCENTAGE
        });
        return;
      }

      const resolved = {
        enabled: items.enabled ?? true,
        replacementPercentage: items.replacementPercentage ?? DEFAULT_REPLACEMENT_PERCENTAGE
      };

      console.log('Content settings loaded.', resolved);
      resolve(resolved);
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

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  console.log('YouTube Immersion Mode observer attached to document.body');
} else {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log('YouTube Immersion Mode observer attached after DOMContentLoaded');
    },
    { once: true }
  );
}

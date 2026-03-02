import fs from 'node:fs';

const requiredFiles = [
  'extension/manifest.json',
  'extension/logo.svg',
  'extension/content.js',
  'extension/popup.html',
  'extension/stopwords.js',
  'extension/processor.js',
  'extension/translation.js',
  'extension/captionObserver.js'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required extension file: ${file}`);
  }
}

console.log('Extension build check passed');

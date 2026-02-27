import fs from 'node:fs';

const requiredFiles = [
  'extension/manifest.json',
  'extension/content.js',
  'extension/popup.html',
  'extension/stopwords.js',
  'extension/processor.js',
  'extension/translation.js'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required extension file: ${file}`);
  }
}

console.log('Extension build check passed');

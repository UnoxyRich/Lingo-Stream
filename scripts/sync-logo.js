import fs from 'node:fs';
import path from 'node:path';

const sourceLogoPath = path.resolve('logo.svg');
const targetLogoPaths = [path.resolve('docs/logo.svg'), path.resolve('extension/logo.svg')];

if (!fs.existsSync(sourceLogoPath)) {
  throw new Error('Root logo.svg not found.');
}

const sourceLogo = fs.readFileSync(sourceLogoPath);

for (const targetPath of targetLogoPaths) {
  fs.writeFileSync(targetPath, sourceLogo);
}

console.log(`Synced ${path.basename(sourceLogoPath)} to docs and extension.`);

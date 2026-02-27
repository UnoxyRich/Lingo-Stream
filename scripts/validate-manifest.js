import fs from 'node:fs';

const manifestPath = 'extension/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const requiredPermissions = ['storage', 'activeTab', 'scripting'];
const missingPermissions = requiredPermissions.filter(
  (permission) => !manifest.permissions?.includes(permission)
);

if (manifest.manifest_version !== 3) {
  throw new Error('manifest_version must be 3');
}

if (missingPermissions.length > 0) {
  throw new Error(`Missing required permissions: ${missingPermissions.join(', ')}`);
}

const hasYouTubeContentScript = (manifest.content_scripts || []).some((script) => {
  const hasMatch = script.matches?.includes('https://www.youtube.com/*');
  const hasContent = script.js?.includes('content.js');
  return hasMatch && hasContent;
});

if (!hasYouTubeContentScript) {
  throw new Error('content_scripts must inject content.js on YouTube');
}

console.log('manifest.json validation passed');

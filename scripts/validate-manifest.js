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

const hostPermissions = manifest.host_permissions || [];
const hasYouTubeHost = hostPermissions.includes('https://www.youtube.com/*');
const hasFreeTranslationHost = hostPermissions.some(
  (host) =>
    host.includes('libretranslate.com') ||
    host.includes('argosopentech.com') ||
    host.includes('apertium.org') ||
    host.includes('mymemory.translated.net')
);

if (!hasYouTubeHost) {
  throw new Error('host_permissions must include https://www.youtube.com/*');
}

if (!hasFreeTranslationHost) {
  throw new Error('host_permissions must include at least one free translation endpoint host');
}

if (!manifest.action?.default_popup) {
  throw new Error('action.default_popup must be configured');
}

console.log('manifest.json validation passed');

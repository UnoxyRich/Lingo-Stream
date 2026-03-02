import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));

describe('manifest validation', () => {
  it('uses manifest v3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('contains required permissions', () => {
    expect(manifest.permissions).toEqual(expect.arrayContaining(['storage', 'activeTab', 'scripting']));
  });

  it('configures content scripts for youtube', () => {
    const hasConfig = manifest.content_scripts.some(
      (item) => item.matches.includes('https://www.youtube.com/*') && item.js.includes('content.js')
    );

    expect(hasConfig).toBe(true);
  });

  it('includes translation host permission and popup action', () => {
    expect(manifest.host_permissions).toEqual(expect.arrayContaining(['https://www.youtube.com/*']));
    expect(
      manifest.host_permissions.some(
        (host) =>
          host.includes('libretranslate.com') ||
          host.includes('argosopentech.com') ||
          host.includes('apertium.org') ||
          host.includes('mymemory.translated.net')
      )
    ).toBe(true);
    expect(manifest.action?.default_popup).toBe('popup.html');
  });
});

import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function loadScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  vm.runInThisContext(source, { filename: path });
}

globalThis.window = globalThis;
loadScript('extension/stopwords.js');

describe('stop-word filtering', () => {
  it('filters stop words, short words, and numbers', () => {
    expect(window.shouldTranslateWord('the', 0)).toBe(false);
    expect(window.shouldTranslateWord('is', 2)).toBe(false);
    expect(window.shouldTranslateWord('42', 1)).toBe(false);
    expect(window.shouldTranslateWord('go', 1)).toBe(false);
    expect(window.shouldTranslateWord('learning', 1)).toBe(true);
  });

  it('skips proper nouns mid-sentence and duplicate words', () => {
    const tokens = ['Today', 'Alice', 'likes', 'apples', 'apples'];
    const result = window.getUniqueTranslatableWordInfos(tokens);
    expect(result.map((entry) => entry.token)).toEqual(['Today', 'likes', 'apples']);
  });
});

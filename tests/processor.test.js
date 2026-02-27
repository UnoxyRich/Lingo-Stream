import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function loadScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  vm.runInThisContext(source, { filename: path });
}

globalThis.window = globalThis;
loadScript('extension/stopwords.js');
loadScript('extension/processor.js');

describe('percentage replacement logic', () => {
  it('calculates replacement count safely', () => {
    expect(window.calculateReplacementCount(0, 5)).toBe(0);
    expect(window.calculateReplacementCount(2, 5)).toBe(1);
    expect(window.calculateReplacementCount(10, 20)).toBe(2);
  });

  it('picks unique words based on percentage', () => {
    const candidates = [
      { index: 0, token: 'learning' },
      { index: 1, token: 'skills' },
      { index: 2, token: 'daily' }
    ];

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const selected = window.pickUniqueWordInfos(candidates, 66);
    expect(selected.length).toBe(1);
    expect(selected[0].token).toBe('learning');
    vi.restoreAllMocks();
  });

  it('builds subtitle with translated suffix format from batched translations', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const translateWordsMock = vi.fn(async (words) => {
      const output = {};
      for (const word of words) {
        output[word.toLowerCase()] = `${word}-es`;
      }

      return output;
    });

    const output = await window.buildImmersiveSubtitle(
      'I enjoy learning skills daily',
      translateWordsMock,
      50
    );

    expect(translateWordsMock).toHaveBeenCalledTimes(1);
    expect(output).toContain('enjoy (enjoy-es)');
    vi.restoreAllMocks();
  });
});

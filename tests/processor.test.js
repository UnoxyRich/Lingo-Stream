import { describe, expect, it, vi } from 'vitest';
import { buildImmersiveSubtitle, calculateReplacementCount, pickUniqueWordInfos } from '../extension/processor.js';

describe('percentage replacement logic', () => {
  it('calculates replacement count safely', () => {
    expect(calculateReplacementCount(0, 5)).toBe(0);
    expect(calculateReplacementCount(2, 5)).toBe(1);
    expect(calculateReplacementCount(10, 20)).toBe(2);
  });

  it('picks unique words based on percentage', () => {
    const candidates = [
      { index: 0, token: 'learning' },
      { index: 1, token: 'skills' },
      { index: 2, token: 'daily' }
    ];

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const selected = pickUniqueWordInfos(candidates, 66);
    expect(selected.length).toBe(1);
    expect(selected[0].token).toBe('learning');
    vi.restoreAllMocks();
  });

  it('builds subtitle with translated suffix format', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const translateMock = vi.fn(async (word) => `${word}-es`);
    const output = await buildImmersiveSubtitle('I enjoy learning skills daily', translateMock, 50);
    expect(output).toContain('enjoy (enjoy-es)');
    vi.restoreAllMocks();
  });
});

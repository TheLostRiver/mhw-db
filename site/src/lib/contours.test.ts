import { describe, expect, it } from 'vitest';
import { contours, ringPath, rng } from './contours';

describe('rng', () => {
  it('同一种子产生相同序列', () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('输出落在 [0, 1)', () => {
    const r = rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('contours', () => {
  it('峰数 × 圈数条闭合路径，且结果可复现', () => {
    const a = contours({ width: 800, height: 600, peaks: 3, rings: 5, seed: 9 });
    expect(a).toHaveLength(15);
    expect(a.every((d) => d.startsWith('M') && d.endsWith('Z'))).toBe(true);
    expect(contours({ width: 800, height: 600, peaks: 3, rings: 5, seed: 9 })).toEqual(a);
  });

  it('无扰动时是以圆心为中心的椭圆', () => {
    const d = ringPath(100, 100, 50, [], 4);
    expect(d.startsWith('M150.0 100.0')).toBe(true);
  });
});

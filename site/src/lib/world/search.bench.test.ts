/**
 * 配装搜索的速度基准：用真实数据（data/world）跑几种典型查询。
 */
import { describe, expect, it } from 'vitest';
import { makeBuilderData } from '../../data/world/builder-data';
import { searchBuilds, toSearchIndex, type SearchQuery } from './search';

const index = toSearchIndex(makeBuilderData());

const CASES: Array<{ name: string; query: SearchQuery }> = [
  {
    name: '会心流（攻击 7 看破 7 弱特 3 超会心 3）',
    query: {
      skills: [
        { id: 19, level: 7 },
        { id: 48, level: 7 },
        { id: 50, level: 3 },
        { id: 49, level: 3 },
      ],
      weaponSlots: [4, 4],
    },
  },
  {
    name: '黑龙 4 + 挑战者 7 + 攻击 7 + 看破 7 + 弱特 3 + 超会心 3 + 无伤 3',
    query: {
      skills: [
        { id: 62, level: 7 },
        { id: 19, level: 7 },
        { id: 48, level: 7 },
        { id: 50, level: 3 },
        { id: 49, level: 3 },
        { id: 63, level: 3 },
      ],
      setSkills: [{ id: 222, level: 4 }],
      weaponSlots: [4, 4],
    },
  },
  {
    name: '宽松（只要攻击 4）',
    query: { skills: [{ id: 19, level: 4 }], weaponSlots: [4] },
  },
  {
    name: '很难凑齐（攻击 7 看破 7 弱特 3 超会心 3 匠 5 体术 5 回避性能 5 耳塞 5）',
    query: {
      skills: [
        { id: 19, level: 7 },
        { id: 48, level: 7 },
        { id: 50, level: 3 },
        { id: 49, level: 3 },
        { id: 54, level: 5 },
        { id: 74, level: 5 },
        { id: 78, level: 5 },
        { id: 11, level: 5 },
      ],
      weaponSlots: [4, 4, 4],
    },
  },
];

describe('配装搜索速度（真实数据）', () => {
  for (const { name, query } of CASES) {
    it(name, () => {
      const t0 = performance.now();
      let first = -1;
      const stats = searchBuilds(index, { maxResults: 1000, ...query }, () => {
        if (first < 0) first = performance.now() - t0;
      });
      const ms = performance.now() - t0;
      console.log(
        `${name}\n  找到 ${stats.found}${stats.truncated ? '+' : ''} 个，组合 ${stats.combos}，` +
          `首个 ${first < 0 ? '—' : first.toFixed(0)} ms，共 ${ms.toFixed(0)} ms，候选 ${JSON.stringify(stats.candidates)}`,
      );
      expect(ms).toBeLessThan(10_000);
    });
  }
});

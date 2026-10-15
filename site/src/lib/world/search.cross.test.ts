/**
 * 配装搜索的正确性交叉验证（真实数据）：
 *  1. 典型查询的每个方案都按原始数据复核（技能点、槽位大小、套装档位、极意解锁）；
 *  2. 随机抽小规模子集，暴力穷举所有防具 × 护石组合，饰品用逐槽穷举判定；
 *     暴力有解时搜索必须也有解，搜索给出的方案必须都能通过复核。
 */
import { describe, expect, it } from 'vitest';
import {
  ARMOR_SLOTS,
  searchBuilds,
  toSearchIndex,
  type ArmorPiece,
  type CharmPiece,
  type SearchIndex,
  type SearchQuery,
  type SearchResult,
} from './search';
import { makeBuilderData } from '../../data/world/builder-data';
import { verifyResult } from './search.verify';

const index = toSearchIndex(makeBuilderData());

/** 可复现的伪随机数 */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** 暴力判定：这套防具 + 护石能否靠饰品凑齐（逐槽穷举，含留空，失败状态记忆化） */
function bruteFeasible(
  idx: SearchIndex,
  query: SearchQuery,
  pieces: ArmorPiece[],
  charm: CharmPiece | null,
): boolean {
  const skills = new Map(idx.skills.map((s) => [s.id, s]));
  const pts = new Map<number, number>();
  const sets = new Map<number, number>();
  const add = (id: number, n: number) => pts.set(id, (pts.get(id) ?? 0) + n);
  for (const p of pieces) {
    for (const s of p.skills) add(s.id, s.level);
    if (p.setSkill) sets.set(p.setSkill.id, (sets.get(p.setSkill.id) ?? 0) + 1);
  }
  for (const s of charm?.skills ?? []) add(s.id, s.level);
  const setLevel = (id: number) => {
    const n = sets.get(id) ?? 0;
    let lv = 0;
    for (const t of skills.get(id)?.setBonusLevels ?? []) if (t <= n && t > lv) lv = t;
    return lv;
  };
  for (const { id, level } of query.setSkills ?? []) if (setLevel(id) < level) return false;
  const targets = query.skills.map(({ id, level }) => {
    const info = skills.get(id);
    const unlocked = !info?.unlockedBy?.length || info.unlockedBy.some((c) => setLevel(c.skill) >= c.level);
    return { id, level, cap: unlocked ? info!.maxLevel : info!.baseMaxLevel };
  });
  if (targets.some((t) => t.level > t.cap)) return false;
  const rem = targets.map((t) => Math.max(0, t.level - (pts.get(t.id) ?? 0)));
  const slots = [...query.weaponSlots, ...pieces.flatMap((p) => p.slots)];
  const decos = idx.decorations
    .map((d) => ({ size: d.size, vec: targets.map((t) => d.skills.find((s) => s.id === t.id)?.level ?? 0) }))
    .filter((d) => d.vec.some((v) => v > 0));
  const failed = new Set<string>();
  const go = (j: number): boolean => {
    if (rem.every((r) => r <= 0)) return true;
    if (j >= slots.length) return false;
    const key = `${j}|${rem.join(',')}`;
    if (failed.has(key)) return false;
    for (const d of decos) {
      if (d.size > slots[j]!) continue;
      if (!d.vec.some((v, i) => v > 0 && rem[i]! > 0)) continue;
      d.vec.forEach((v, i) => (rem[i]! -= v));
      const ok = go(j + 1);
      d.vec.forEach((v, i) => (rem[i]! += v));
      if (ok) return true;
    }
    if (go(j + 1)) return true;
    failed.add(key);
    return false;
  };
  return go(0);
}

describe('配装搜索交叉验证（真实数据）', () => {
  it('典型查询的方案逐条复核', () => {
    const queries: SearchQuery[] = [
      {
        skills: [
          { id: 19, level: 7 },
          { id: 48, level: 7 },
          { id: 50, level: 3 },
          { id: 49, level: 3 },
        ],
        weaponSlots: [4, 4],
      },
      {
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
      {
        skills: [
          { id: 61, level: 7 },
          { id: 101, level: 5 },
          { id: 54, level: 5 },
        ],
        weaponSlots: [4, 2],
        minRarity: 10,
        excludeDecorations: [],
      },
    ];
    for (const q of queries) {
      let n = 0;
      searchBuilds(index, { maxResults: 300, ...q }, (r) => {
        n++;
        expect(verifyResult(index, q, r)).toBeNull();
      });
      expect(n).toBeGreaterThan(0);
    }
  });

  it('随机子集：暴力有解时搜索也有解，搜索方案都能复核', () => {
    const rand = rng(20261015);
    const pick = <T>(arr: T[], n: number) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a.slice(0, n);
    };
    const highRank = (p: { rarity: number }) => p.rarity >= 9;
    let feasibleCases = 0;
    for (let round = 0; round < 150; round++) {
      const armor = Object.fromEntries(
        ARMOR_SLOTS.map((s) => [s, pick(index.armor[s].filter(highRank), 4)]),
      ) as SearchIndex['armor'];
      const charms = pick(index.charms.filter(highRank), 6);
      const sub: SearchIndex = { ...index, armor, charms };
      // 目标从这些装备与饰品出现过的技能里挑
      const pool = new Set<number>();
      for (const s of ARMOR_SLOTS) for (const p of armor[s]) for (const k of p.skills) pool.add(k.id);
      for (const c of charms) for (const k of c.skills) pool.add(k.id);
      const skillInfo = new Map(index.skills.map((s) => [s.id, s]));
      const chosen = pick(
        [...pool].filter((id) => !skillInfo.get(id)?.setBonus),
        1 + Math.floor(rand() * 4),
      );
      const query: SearchQuery = {
        skills: chosen.map((id) => ({
          id,
          level: 1 + Math.floor(rand() * Math.min(skillInfo.get(id)!.maxLevel, 4)),
        })),
        weaponSlots: pick([[4, 4], [4], [3, 1], [], [4, 4, 4], [2, 2, 1]], 1)[0]!,
      };
      // 有时带上套装目标
      const setIds = [
        ...new Set(ARMOR_SLOTS.flatMap((s) => armor[s].flatMap((p) => (p.setSkill ? [p.setSkill.id] : [])))),
      ];
      if (setIds.length && rand() < 0.35) {
        const sid = pick(setIds, 1)[0]!;
        const tiers = skillInfo.get(sid)?.setBonusLevels ?? [];
        if (tiers.length) query.setSkills = [{ id: sid, level: pick(tiers, 1)[0]! }];
      }

      // 暴力：所有防具（含空着）× 护石（含不带）
      let brute = false;
      const slots = ARMOR_SLOTS.map((s) => [...armor[s], null]);
      outer: for (const h of slots[0]!)
        for (const c of slots[1]!)
          for (const a of slots[2]!)
            for (const w of slots[3]!)
              for (const l of slots[4]!) {
                const pieces = [h, c, a, w, l].filter((p): p is ArmorPiece => p != null);
                for (const ch of [null, ...charms]) {
                  if (bruteFeasible(sub, query, pieces, ch)) {
                    brute = true;
                    break outer;
                  }
                }
              }

      const results: SearchResult[] = [];
      searchBuilds(sub, { ...query, maxResults: 50 }, (r) => {
        results.push(r);
      });
      for (const r of results) {
        const err = verifyResult(sub, query, r);
        if (err) throw new Error(`第 ${round} 轮：${err}\n${JSON.stringify(query)}`);
      }
      if (brute !== results.length > 0)
        throw new Error(
          `第 ${round} 轮：暴力 ${brute ? '有' : '无'}解，搜索 ${results.length} 个\n${JSON.stringify(query)}`,
        );
      if (brute) feasibleCases++;
    }
    // 抽样里既要有有解的、也要有无解的，才算验证到了
    expect(feasibleCases).toBeGreaterThan(20);
    expect(feasibleCases).toBeLessThan(150);
  }, 300_000);
});

/**
 * 怪物数据的显示规则：名字、图标、肉质表（按等级与状态展开，左右同值的部位合并成一行）。
 * 数据见 monsters.json（pipeline/mhdb/build/world_monsters.py）。
 */
import type { Hitzone, Monster } from '../../data/world/schema';

export const monsterName = (m: Monster): string => m.name?.['zh-Hans'] ?? m.key;
export const monsterIconUrl = (m: Monster): string | null =>
  m.icon ? `/assets/game/world/monster/${m.icon}.webp` : null;

/** 每个等级 5 个状态。「受伤」「特殊 1–3」是格式说明里的字段名，游戏内对应哪种状态未逐一确认 */
export const STATE_LABELS = ['通常', '受伤*', '特殊 1*', '特殊 2*', '特殊 3*'] as const;

export const ELEMENTS = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const;
export const ELEMENT_LABEL: Record<(typeof ELEMENTS)[number], string> = {
  fire: '火',
  water: '水',
  thunder: '雷',
  ice: '冰',
  dragon: '龙',
};
export const STATUS_LABEL = {
  poison: '毒',
  sleep: '睡眠',
  paralysis: '麻痹',
  blast: '爆破',
  stun: '眩晕',
  exhaust: '减气',
  mount: '骑乘',
} as const;
export const EXTRACT_LABEL: Record<NonNullable<Monster['parts'][number]['extract']>, string> = {
  red: '红',
  white: '白',
  orange: '橙',
  green: '绿',
};

/** 某槽在某等级、某状态下的肉质编号；大师级没有单独设置时沿用上位及以下的编号 */
export function hitzoneId(hz: number[], master: boolean, state: number): number {
  const mr = hz[5 + state] ?? -1;
  if (master && mr >= 0) return mr;
  return hz[state] ?? -1;
}

export interface HitzoneRow {
  label: string;
  /** 受击判定的开发名（来源） */
  names: string[];
  /** 部位序号（从 0 起）；左右合并时有两个 */
  parts: number[];
  state: number;
  id: number;
  hz: Hitzone;
}

/**
 * 展开成肉质表的行：每个部位的每个槽、每个存在的状态一行；左右两侧肉质编号相同的（左翼 / 右翼）合并为一行。
 */
export function hitzoneRows(m: Monster, master: boolean): HitzoneRow[] {
  const rows: HitzoneRow[] = [];
  m.parts.forEach((p, pi) => {
    p.slots.forEach((slot) => {
      for (let state = 0; state < 5; state++) {
        const id = hitzoneId(slot.hz, master, state);
        const hz = id >= 0 ? m.hitzones[id] : undefined;
        if (!hz) continue;
        // 非通常状态与通常相同时不单列
        if (state > 0 && id === hitzoneId(slot.hz, master, 0)) continue;
        rows.push({ label: slot.label, names: slot.names, parts: [pi], state, id, hz });
      }
    });
  });
  const out: HitzoneRow[] = [];
  for (const r of rows) {
    const side = r.label.startsWith('左') ? '右' : r.label.startsWith('右') ? '左' : null;
    const twin =
      side &&
      out.find(
        (o) =>
          o.id === r.id && o.state === r.state && o.label === side + r.label.slice(1) && o.parts.length === 1,
      );
    if (twin) {
      twin.label = r.label.slice(1);
      twin.parts.push(...r.parts);
      twin.names = [...twin.names, ...r.names];
    } else out.push({ ...r, parts: [...r.parts], names: [...r.names] });
  }
  return out;
}

/** 物理肉质 ≥ 45 是弱点特效的触发线；属性肉质 ≥ 20 标出 */
export const isWeakPhysical = (v: number) => v >= 45;
export const isWeakElement = (v: number) => v >= 20;

/** 两个等级的肉质完全相同时（多数大师级专属怪物）只显示一份 */
export function sameAcrossRanks(m: Monster): boolean {
  return m.parts.every((p) =>
    p.slots.every((s) => [0, 1, 2, 3, 4].every((st) => hitzoneId(s.hz, true, st) === s.hz[st])),
  );
}

/** 狩猎笔记的星级：-1 不显示，0 为无效 */
export const stars = (n: number) => (n < 0 ? '—' : n === 0 ? '×' : '★'.repeat(n));

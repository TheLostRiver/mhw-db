/**
 * /data/world/damage.json 的结构与客户端用的整理函数（伤害计算器）。
 */
import type { Move, WeaponType } from '../../data/world/schema';
import { hitzoneId } from './monsters';

export interface DamageMove {
  weapon: WeaponType | 'common';
  group: Move['group'];
  name: string;
  ja: string;
  type: Move['type'];
  mv: number;
  ele: number;
  status: number;
  fixed: number;
  stun: number;
  exhaust: number;
}

export interface DamageMonster {
  key: string;
  name: string;
  icon: string | null;
  parts: { label: string; slots: { label: string; hz: number[] }[] }[];
  /** 每条 10 个值：斩、打、弹、火、水、雷、冰、龙、眩晕、减气 */
  hitzones: number[][];
}

export interface DamageData {
  constants: {
    weaponBloat: Record<string, number>;
    critMultiplier: number;
    badCritMultiplier: number;
    sharpness: { raw: number[]; element: number[] };
    /** 超会心每级的会心倍率（%） */
    critBoost: number[];
    /** 弱点特效每级的会心率加成：[有效部位, 受伤的有效部位] */
    weakness: [number, number][];
  };
  moves: DamageMove[];
  monsters: DamageMonster[];
}

export const STATE_NAMES = ['通常', '受伤*', '特殊 1*', '特殊 2*', '特殊 3*'] as const;

export interface TargetRow {
  /** 行的唯一键：部位-槽-状态 */
  key: string;
  label: string;
  state: number;
  hz: number[];
}

/**
 * 怪物在某等级下可选的命中目标：每个部位的每个槽、每个存在的状态一行；左右同值的合并。
 */
export function targetRows(m: DamageMonster, master: boolean): TargetRow[] {
  const out: (TargetRow & { id: number })[] = [];
  m.parts.forEach((p, pi) =>
    p.slots.forEach((s, si) => {
      for (let state = 0; state < 5; state++) {
        const id = hitzoneId(s.hz, master, state);
        const hz = id >= 0 ? m.hitzones[id] : undefined;
        if (!hz || (state > 0 && id === hitzoneId(s.hz, master, 0))) continue;
        const side = s.label[0] === '左' ? '右' : s.label[0] === '右' ? '左' : null;
        const twin =
          side && out.find((o) => o.id === id && o.state === state && o.label === side + s.label.slice(1));
        if (twin) {
          twin.label = s.label.slice(1);
          continue;
        }
        out.push({ key: `${pi}-${si}-${state}`, label: s.label, state, hz, id });
      }
    }),
  );
  return out.map((r) => ({ key: r.key, label: r.label, state: r.state, hz: r.hz }));
}

/** 两个等级的肉质完全相同（只有一种等级的怪物） */
export const singleRank = (m: DamageMonster) =>
  m.parts.every((p) =>
    p.slots.every((s) => [0, 1, 2, 3, 4].every((st) => hitzoneId(s.hz, true, st) === s.hz[st])),
  );

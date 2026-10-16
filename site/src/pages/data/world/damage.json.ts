/**
 * 伤害计算器的精简数据：构建时生成 /data/world/damage.json。
 * 含常量（武器倍率、会心倍率、锐利度补正）、全部招式（动作值与补正）、怪物的部位与肉质。
 */
import type { APIRoute } from 'astro';
import { loadConstants, loadMonsters, loadMoves, loadSkills } from '../../../data/world/load';
import { HITZONE_KEYS } from '../../../data/world/schema';
import { moveName } from '../../../lib/world/moves';
import { monsterIconUrl, monsterName } from '../../../lib/world/monsters';
import type { DamageData } from '../../../lib/world/damage-data';

// 技能编号：超会心 49（参数 0 为会心倍率 %），弱点特效 50（参数 0 / 1 为有效部位 / 受伤部位的会心率）
const SKILL_CRIT_BOOST = 49;
const SKILL_WEAKNESS = 50;

export const GET: APIRoute = () => {
  const c = loadConstants();
  const skills = loadSkills();
  const levels = (id: number) => skills.find((s) => s.id === id)?.levels ?? [];
  const data: DamageData = {
    constants: {
      weaponBloat: c.weaponBloat,
      critMultiplier: c.critMultiplier,
      badCritMultiplier: c.badCritMultiplier,
      sharpness: c.sharpness,
      critBoost: levels(SKILL_CRIT_BOOST).map((l) => l.params[0] ?? 0),
      weakness: levels(SKILL_WEAKNESS).map((l) => [l.params[0] ?? 0, l.params[1] ?? 0] as [number, number]),
    },
    moves: loadMoves()
      .filter((m) => m.mv > 0 || m.fixed > 0)
      .map((m) => ({
        weapon: m.weapon,
        group: m.group,
        name: moveName(m),
        ja: m.ja,
        type: m.type,
        mv: m.mv,
        ele: m.ele,
        status: m.status,
        fixed: m.fixed,
        stun: m.stun,
        exhaust: m.exhaust,
      })),
    monsters: loadMonsters()
      .filter((m) => m.name)
      .map((m) => ({
        key: m.key,
        name: monsterName(m),
        icon: monsterIconUrl(m),
        parts: m.parts.map((p) => ({
          label: p.label,
          slots: p.slots.map((s) => ({ label: s.label, hz: s.hz })),
        })),
        hitzones: m.hitzones.map((h) => HITZONE_KEYS.map((k) => h[k])),
      })),
  };
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
};

/**
 * 配装器的精简数据（简中）：构建时生成 /data/world/builder.json。
 */
import type { APIRoute } from 'astro';
import type { BuilderData } from '../../../lib/world/builder';
import {
  loadArmor,
  loadCharms,
  loadColors,
  loadDecorations,
  loadMantles,
  loadMeta,
  loadSkills,
  pick,
} from '../../../data/world/load';

const L = 'zh-Hans' as const;

export const GET: APIRoute = () => {
  const meta = loadMeta();
  const colors = loadColors();
  const data: BuilderData = {
    meta: { steamBuildId: meta.steamBuildId, builtAt: meta.builtAt },
    colors: { rarity: colors.rarity, icon: colors.icon },
    skills: loadSkills().map((s) => ({
      id: s.id,
      name: pick(s.name, L),
      setBonus: s.setBonus,
      iconColor: s.iconColor,
      maxLevel: s.maxLevel,
      baseMaxLevel: s.baseMaxLevel,
      levels: s.levels.map((l) => ({
        level: l.level,
        desc: pick(l.desc, L),
        params: l.params,
        ...(l.unlockedBy ? { unlockedBy: l.unlockedBy } : {}),
      })),
    })),
    decorations: loadDecorations().map((d) => ({
      id: d.id,
      name: pick(d.name, L),
      size: d.size,
      rarity: d.rarity,
      skills: d.skills,
      iconColor: d.icon.color,
    })),
    armor: loadArmor().map((a) => ({
      id: a.id,
      name: pick(a.name, L),
      slot: a.slot,
      rarity: a.rarity,
      defense: a.defense,
      resist: [a.resist.fire, a.resist.water, a.resist.thunder, a.resist.ice, a.resist.dragon],
      slots: a.slots,
      skills: a.skills,
      ...(a.setSkill ? { setSkill: a.setSkill } : {}),
      series: pick(a.series.name, L),
    })),
    charms: loadCharms().map((c) => ({ id: c.id, name: pick(c.name, L), rarity: c.rarity, skills: c.skills })),
    mantles: loadMantles().map((m) => ({ id: m.id, name: pick(m.name, L), slots: m.slots, icon: m.icon })),
  };
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
};

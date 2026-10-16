/**
 * 每种武器的精简数据（简中）：构建时生成 /data/world/weapons/<种类>.json，配装器按需加载。
 * 含该武器种的零件强化与冥赤龙觉醒能力；同名同数值的重复行（duplicateOf）不输出。
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import type { WeaponPayload } from '../../../../lib/world/builder';
import { loadWeaponCustom, loadWeapons, pick } from '../../../../data/world/load';
import { WEAPON_TYPES, type WeaponType } from '../../../../data/world/schema';
import { plainText } from '../../../../lib/world/text';

export const getStaticPaths = (() => WEAPON_TYPES.map((type) => ({ params: { type } }))) satisfies GetStaticPaths;

const L = 'zh-Hans' as const;

export const GET: APIRoute = ({ params }) => {
  const type = params.type as WeaponType;
  const custom = loadWeaponCustom();
  const weapons = loadWeapons(type)
    .filter((w) => w.duplicateOf == null)
    .map((w) => ({
    id: w.id,
    name: pick(w.name, L),
    rarity: w.rarity,
    attack: w.attack,
    affinity: w.affinity,
    defense: w.defense,
    element: w.element,
    hiddenElement: w.hiddenElement,
    elderseal: w.elderseal,
    slots: w.slots,
    skill: w.skill,
    ...(w.sharpness ? { sharpness: w.sharpness.bars, handicraft: w.sharpness.handicraftSteps } : {}),
    ...(w.awakened ? { awakened: true } : {}),
  }));
  const payload: WeaponPayload = {
    weapons,
    parts: (custom.parts[type] ?? []).map((p) => ({
      id: p.id,
      stage: p.stage,
      name: pick(p.name, L),
      desc: plainText(pick(p.desc, L)),
      effect: p.effect,
    })),
    awakening: custom.awakening
      .filter((a) => a.weapons.includes(type))
      .map((a) => ({
        id: a.id,
        category: a.category,
        rank: a.rank,
        name: pick(a.name, L),
        desc: plainText(pick(a.desc, L)),
        stackable: a.stackable,
        onePerCategory: a.onePerCategory,
        setSkill: a.setSkill,
        ...(a.value?.byWeapon[type] ? { effect: { kind: a.value.kind, amount: a.value.byWeapon[type] } } : {}),
      })),
  };
  return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
};

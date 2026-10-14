/**
 * 每种武器的精简数据（简中）：构建时生成 /data/world/weapons/<种类>.json，配装器按需加载。
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import type { WeaponData } from '../../../../lib/world/builder';
import { loadWeapons, pick } from '../../../../data/world/load';
import { WEAPON_TYPES, type WeaponType } from '../../../../data/world/schema';

export const getStaticPaths = (() => WEAPON_TYPES.map((type) => ({ params: { type } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const weapons: WeaponData[] = loadWeapons(params.type as WeaponType).map((w) => ({
    id: w.id,
    name: pick(w.name, 'zh-Hans'),
    rarity: w.rarity,
    attack: w.attack,
    affinity: w.affinity,
    defense: w.defense,
    element: w.element,
    hiddenElement: w.hiddenElement,
    elderseal: w.elderseal,
    slots: w.slots,
    skill: w.skill,
    ...(w.sharpness ? { sharpness: w.sharpness.bars } : {}),
  }));
  return new Response(JSON.stringify(weapons), { headers: { 'content-type': 'application/json' } });
};

/**
 * 构建期读取 data/world/*.json（只在 Astro 的服务端 / 构建期使用）。
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  Armor,
  Charm,
  Colors,
  Constants,
  Decoration,
  Item,
  Lang,
  Mantle,
  MapStage,
  Meta,
  Skill,
  Weapon,
  WeaponCustom,
  WeaponType,
} from './schema';

const ROOT = new URL('../../../../data/world/', import.meta.url);
// 按修改时间缓存：开发服务器常驻时，重新运行 mhdb parse 后能读到新数据
const cache = new Map<string, { mtime: number; data: unknown }>();

function read<T>(rel: string): T {
  const path = fileURLToPath(new URL(rel, ROOT));
  const mtime = statSync(path).mtimeMs;
  let hit = cache.get(rel);
  if (!hit || hit.mtime !== mtime) {
    hit = { mtime, data: JSON.parse(readFileSync(path, 'utf-8')) };
    cache.set(rel, hit);
  }
  return hit.data as T;
}

export const loadMeta = () => read<Meta>('meta.json');
export const loadColors = () => read<Colors>('colors.json');
export const loadItems = () => read<{ items: Item[] }>('items.json').items;
export const loadSkills = () => read<{ skills: Skill[] }>('skills.json').skills;
export const loadDecorations = () => read<{ decorations: Decoration[] }>('decorations.json').decorations;
export const loadArmor = () => read<{ armor: Armor[] }>('armor.json').armor;
export const loadCharms = () => read<{ charms: Charm[] }>('charms.json').charms;
export const loadMantles = () => read<{ mantles: Mantle[] }>('mantles.json').mantles;
export const loadWeapons = (type: WeaponType) => read<{ weapons: Weapon[] }>(`weapons/${type}.json`).weapons;
export const loadWeaponCustom = () => read<WeaponCustom>('weapon-custom.json');
export const loadConstants = () => read<Constants>('constants.json');
export const loadMaps = () => read<{ stages: MapStage[] }>('maps.json').stages;

/** 取某语言文本，缺失时退回简中 */
export const pick = (t: { [K in Lang]?: string | undefined } | undefined, lang: Lang): string =>
  t?.[lang] ?? t?.['zh-Hans'] ?? '';

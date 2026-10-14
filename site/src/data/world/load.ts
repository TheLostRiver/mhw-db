/**
 * 构建期读取 data/world/*.json（只在 Astro 的服务端 / 构建期使用）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Armor, Charm, Colors, Decoration, Item, Lang, Mantle, Meta, Skill, Weapon, WeaponType } from './schema';

const ROOT = new URL('../../../../data/world/', import.meta.url);
const cache = new Map<string, unknown>();

function read<T>(rel: string): T {
  if (!cache.has(rel)) cache.set(rel, JSON.parse(readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8')));
  return cache.get(rel) as T;
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

/** 取某语言文本，缺失时退回简中 */
export const pick = (t: { [K in Lang]?: string | undefined } | undefined, lang: Lang): string =>
  t?.[lang] ?? t?.['zh-Hans'] ?? '';

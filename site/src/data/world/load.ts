/**
 * 构建期读取 data/world/*.json（只在 Astro 的服务端 / 构建期使用）。
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  Armor,
  Charm,
  Colors,
  Combination,
  Constants,
  Decoration,
  Item,
  Kinsect,
  Lang,
  LayeredArmor,
  LayeredWeapon,
  Mantle,
  MapNodeStage,
  MapStage,
  Melody,
  Meta,
  Monster,
  Move,
  Pendant,
  Skill,
  Weapon,
  WeaponCustom,
  WeaponType,
} from './schema';
import type {
  ArgosyItem,
  Botany,
  Bounty,
  Delivery,
  Expeditions,
  MelderTarget,
  ShopItem,
  Steamworks,
} from './schema-facilities';
import type { Canteen, Palico, PalicoGearItem } from './schema-palico';
import type { Mechanics } from './schema-mechanics';
import type { Records, Schedule } from './schema-records';
import type { MonsterReward, Quests } from './schema-quests';

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
/** 物品编号 → 物品（随 items.json 的缓存一起失效） */
const itemIndex = new WeakMap<Item[], Map<number, Item>>();
export function itemById(id: number): Item | undefined {
  const items = loadItems();
  let map = itemIndex.get(items);
  if (!map) itemIndex.set(items, (map = new Map(items.map((i) => [i.id, i]))));
  return map.get(id);
}
export const loadCombinations = () => read<{ combinations: Combination[] }>('combinations.json').combinations;
export const loadSkills = () => read<{ skills: Skill[] }>('skills.json').skills;
export const loadDecorations = () => read<{ decorations: Decoration[] }>('decorations.json').decorations;
export const loadArmor = () => read<{ armor: Armor[] }>('armor.json').armor;
export const loadCharms = () => read<{ charms: Charm[] }>('charms.json').charms;
export const loadMantles = () => read<{ mantles: Mantle[] }>('mantles.json').mantles;
export const loadWeapons = (type: WeaponType) => read<{ weapons: Weapon[] }>(`weapons/${type}.json`).weapons;
export const loadWeaponCustom = () => read<WeaponCustom>('weapon-custom.json');
export const loadConstants = () => read<Constants>('constants.json');
export const loadMaps = () => read<{ stages: MapStage[] }>('maps.json').stages;
export const loadMapNodes = () => read<{ stages: MapNodeStage[] }>('map-nodes.json').stages;
export const loadMoves = () => read<{ moves: Move[] }>('moves.json').moves;
export const loadMonsters = () => read<{ monsters: Monster[] }>('monsters.json').monsters;
export const loadKinsects = () => read<{ kinsects: Kinsect[] }>('kinsects.json').kinsects;
export const loadMelodies = () => read<{ melodies: Melody[] }>('melodies.json').melodies;
export const loadPendants = () => read<{ pendants: Pendant[] }>('pendants.json').pendants;
export const loadLayeredArmor = () => read<{ layered: LayeredArmor[] }>('armor-layered.json').layered;
export const loadLayeredWeapons = () => read<Partial<Record<WeaponType, LayeredWeapon[]>>>('weapon-layered.json');
export const loadPalicoGear = () => read<{ gear: PalicoGearItem[] }>('palico-gear.json').gear;
export const loadPalico = () => read<Palico>('palico.json');
export const loadCanteen = () => read<Canteen>('canteen.json');
export const loadRecords = () => read<Records>('records.json');
export const loadSchedule = () => read<Schedule>('schedule.json');
export const loadMechanics = () => read<Mechanics>('mechanics.json');
export const loadQuests = () => read<Quests>('quests.json');
export const loadMonsterRewards = () => read<{ rewards: MonsterReward[] }>('monster-rewards.json').rewards;
export const loadMelder = () => read<{ melder: MelderTarget[] }>('facilities/melder.json').melder;
export const loadShop = () => read<{ shop: ShopItem[] }>('facilities/shop.json').shop;
export const loadDeliveries = () => read<{ deliveries: Delivery[] }>('facilities/deliveries.json').deliveries;
export const loadBounties = () => read<{ bounties: Bounty[] }>('facilities/bounties.json').bounties;
export const loadArgosy = () => read<{ argosy: ArgosyItem[] }>('facilities/argosy.json').argosy;
export const loadSteamworks = () => read<Steamworks>('facilities/steamworks.json');
export const loadExpeditions = () => read<Expeditions>('facilities/expeditions.json');
export const loadBotany = () => read<Botany>('facilities/botany.json');
/** 怪物 gameId（解锁条件等字段里的编号）→ 怪物名；同一 gameId 取第一个有名字的 */
export function monsterNameByGameId(id: number): string | undefined {
  return loadMonsters().find((m) => m.gameId === id && m.name)?.name?.['zh-Hans'];
}

/** 取某语言文本，缺失时退回简中 */
export const pick = (t: { [K in Lang]?: string | undefined } | undefined, lang: Lang): string =>
  t?.[lang] ?? t?.['zh-Hans'] ?? '';

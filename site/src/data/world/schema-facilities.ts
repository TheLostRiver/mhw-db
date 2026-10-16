/**
 * 据点设施的数据结构（data/world/facilities/*.json，见 pipeline/mhdb/build/world_facilities.py 与 docs/DATA.md 3.7）。
 */
import { z } from 'zod';
import { OptText, Src, Text } from './schema';

const Id = z.number().int().positive();
const Count = z.number().int().positive();
const ItemCount = z.object({ item: Id, count: Count }).strict();

export const MelderTarget = z
  .object({
    item: Id,
    /** 消耗的调查点数 */
    points: z.number().int().nonnegative(),
    /** 需要凑满的炼金值 */
    melding: z.number().int().positive(),
    category: z.enum(['item', 'ammo', 'material', 'decoration']),
    unlock: z.number().int().nonnegative(),
    /** [素材, 每个提供的炼金值]，按炼金值降序 */
    sources: z.array(z.tuple([Id, Count])),
    _src: Src,
  })
  .strict();
export type MelderTarget = z.infer<typeof MelderTarget>;

export const ShopItem = z
  .object({ item: Id, unlock: z.number().int().nonnegative(), sort: z.number().int(), _src: Src })
  .strict();
export type ShopItem = z.infer<typeof ShopItem>;

export const Delivery = z
  .object({
    id: z.number().int().nonnegative(),
    title: Text,
    client: OptText,
    desc: OptText,
    reward: OptText,
    kind: z.number().int().nonnegative(),
    cost: z.number().int().nonnegative(),
    materials: z.array(ItemCount),
    rewardItem: Id.optional(),
    _src: Src,
  })
  .strict();
export type Delivery = z.infer<typeof Delivery>;

export const Bounty = z
  .object({
    id: z.number().int().nonnegative(),
    title: Text,
    desc: OptText,
    important: z.boolean(),
    rank: z.enum(['low', 'high', 'master']),
    type: z.number().int(),
    rewards: z.array(ItemCount),
    points: z.number().int().nonnegative(),
    progress: z.tuple([z.number().int(), z.number().int()]).optional(),
    _src: Src,
  })
  .strict();
export type Bounty = z.infer<typeof Bounty>;

const SteamReward = z
  .object({ tier: z.number().int(), item: Id, count: Count, weight: z.number().int().nonnegative(), _src: Src })
  .strict();
export const Steamworks = z
  .object({
    rewards: z.record(
      z.enum(['base', 'spring', 'summer', 'autumn', 'winter', 'memorial']),
      z.array(SteamReward).min(1),
    ),
    fuel: z.array(z.object({ item: Id, fuel: Count, _src: Src }).strict()).min(1),
  })
  .strict();
export type Steamworks = z.infer<typeof Steamworks>;

export const Expeditions = z
  .object({
    rewards: z.array(
      z
        .object({
          id: z.number().int().nonnegative(),
          gather: z.enum(['ore', 'bone', 'plant', 'mushroom', 'monster']),
          items: z
            .array(z.object({ item: Id, count: Count, weight: z.number().int().nonnegative() }).strict())
            .min(1),
          _src: Src,
        })
        .strict(),
    ),
    targets: z.array(
      z
        .object({
          stage: z.number().int(),
          rank: z.enum(['low', 'high', 'master']),
          reward: z.number().int().nonnegative(),
          quest: z.number().int().nonnegative(),
          _src: Src,
        })
        .strict(),
    ),
  })
  .strict();
export type Expeditions = z.infer<typeof Expeditions>;

export const ArgosyItem = z
  .object({
    kind: z.enum(['goods', 'material', 'value']),
    rare: z.boolean(),
    item: Id,
    qty: z.array(z.number().int().nonnegative()).length(6),
    weight: z.array(z.number().int().nonnegative()).length(6),
    _src: Src,
  })
  .strict();
export type ArgosyItem = z.infer<typeof ArgosyItem>;

export const Botany = z
  .object({
    plants: z
      .array(
        z
          .object({
            item: Id,
            category: z.enum(['plant', 'insect', 'mushroom']),
            quests: Count,
            harvest: z.tuple([Count, Count, Count]),
            initial: z.boolean(),
            _src: Src,
          })
          .strict(),
      )
      .min(1),
    fertilizers: z
      .array(
        z
          .object({
            name: Text,
            desc: OptText,
            effect: OptText,
            price: z.number().int().nonnegative(),
            duration: Count,
            _src: Src,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type Botany = z.infer<typeof Botany>;

/** 文件 → 结构 */
export const FACILITY_FILES = {
  'facilities/melder.json': z.object({ melder: z.array(MelderTarget).min(1) }).strict(),
  'facilities/shop.json': z.object({ shop: z.array(ShopItem).min(1) }).strict(),
  'facilities/deliveries.json': z.object({ deliveries: z.array(Delivery).min(1) }).strict(),
  'facilities/bounties.json': z.object({ bounties: z.array(Bounty).min(1) }).strict(),
  'facilities/argosy.json': z.object({ argosy: z.array(ArgosyItem).min(1) }).strict(),
  'facilities/steamworks.json': Steamworks,
  'facilities/expeditions.json': Expeditions,
  'facilities/botany.json': Botany,
} as const;

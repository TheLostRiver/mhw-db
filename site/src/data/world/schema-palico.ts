/**
 * 随从与食堂的数据结构（palico-gear.json、palico.json、canteen.json，见 pipeline/mhdb/build/world_palico.py 与 docs/DATA.md 3.8）。
 */
import { z } from 'zod';
import { OptText, Src, Text } from './schema';

const ItemCount = z.object({ item: z.number().int().positive(), count: z.number().int().positive() }).strict();

const GearBase = {
  id: z.string(),
  name: Text,
  desc: OptText,
  series: z.object({ id: z.number().int(), name: OptText }).strict(),
  rarity: z.number().int().min(1).max(12),
  order: z.number().int(),
  /** 调查点数 */
  cost: z.number().int().nonnegative(),
  rank: z.enum(['low', 'high', 'master']).nullable(),
  materials: z.array(ItemCount),
  _src: Src,
};

export const PalicoWeapon = z
  .object({
    ...GearBase,
    kind: z.literal('weapon'),
    attackType: z.enum(['sever', 'blunt']),
    melee: z.number().int().nonnegative(),
    ranged: z.number().int().nonnegative(),
    element: z
      .object({
        type: z.enum(['fire', 'water', 'ice', 'thunder', 'dragon', 'poison', 'paralysis', 'sleep', 'blast']),
        value: z.number().int().positive(),
      })
      .strict()
      .optional(),
    affinity: z.number().int(),
    defense: z.number().int().nonnegative(),
    elderseal: z.number().int().min(0).max(3),
  })
  .strict();

export const PalicoArmor = z
  .object({
    ...GearBase,
    kind: z.enum(['head', 'body']),
    defense: z.number().int().nonnegative(),
    /** 火 水 冰 雷 龙 */
    resist: z.array(z.number().int()).length(5),
    fullSet: z.boolean(),
  })
  .strict();

export const PalicoGear = z.object({ gear: z.array(z.union([PalicoWeapon, PalicoArmor])).min(1) }).strict();
export type PalicoGearItem = z.infer<typeof PalicoWeapon> | z.infer<typeof PalicoArmor>;

export const Palico = z
  .object({
    gadgets: z
      .array(
        z
          .object({
            id: z.number().int(),
            name: Text,
            desc: OptText,
            moves: z.array(z.object({ name: Text, order: OptText }).strict()).min(1),
            /** 升到 Lv2…Lv15 所需经验 */
            exp: z.array(z.number().int().positive()),
            _src: Src,
          })
          .strict(),
      )
      .length(7),
    level: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(50),
            exp: z.number().int().nonnegative(),
            attack: z.number().int(),
            defense: z.number().int(),
            health: z.number().int(),
            guard: z.number().int(),
          })
          .strict(),
      )
      .length(50),
    _src: z.object({ level: z.string() }).strict(),
  })
  .strict();
export type Palico = z.infer<typeof Palico>;

export const Canteen = z
  .object({
    skills: z
      .array(
        z
          .object({
            id: z.number().int().nonnegative(),
            name: Text,
            desc: OptText,
            /** -1 日替技能，0–8 食材系 */
            group: z.number().int().min(-1).max(8),
            tier: z.number().int().min(0).max(3),
            _src: Src,
          })
          .strict(),
      )
      .min(1),
    ingredients: z
      .array(
        z
          .object({
            id: z.number().int().nonnegative(),
            name: Text,
            desc: OptText,
            category: z.enum(['meat', 'fish', 'veg', 'drink']),
            group: z.number().int().min(0).max(8),
            _src: Src,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type Canteen = z.infer<typeof Canteen>;

export const PALICO_FILES = {
  'palico-gear.json': PalicoGear,
  'palico.json': Palico,
  'canteen.json': Canteen,
} as const;

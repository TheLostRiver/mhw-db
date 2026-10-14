/**
 * data/world/*.json 的结构定义（单一来源）。字段含义见 docs/DATA.md。
 * 数值保留游戏文件中的原值；显示用的换算（如武器攻击力倍率）在 lib 里做。
 */
import { z } from 'zod';

export const LANGS = ['zh-Hans', 'zh-Hant', 'ja', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** 四语文本；简中必有，其他语言缺失时省略 */
export const Text = z
  .object({
    'zh-Hans': z.string().min(1),
    'zh-Hant': z.string().optional(),
    ja: z.string().optional(),
    en: z.string().optional(),
  })
  .strict();
const OptText = Text.partial();

const Src = z.object({ file: z.string().startsWith('common/'), row: z.number().int().nonnegative() }).strict();
const Rarity = z.number().int().min(1).max(12);
const SkillRef = z.object({ id: z.number().int().nonnegative(), level: z.number().int().min(1) }).strict();
const Slots = z.array(z.number().int().min(1).max(4)).max(3);
const Icon = z.object({ id: z.number().int().min(0).max(255), color: z.number().int().min(0) }).strict();

export const Meta = z
  .object({
    game: z.literal('world'),
    steamBuildId: z.string().nullable(),
    exeSha256: z.string().nullable(),
    chunkDigest: z.string(),
    extractedAt: z.string(),
    builtAt: z.string(),
    pipelineVersion: z.number().int(),
    languages: z.array(z.enum(LANGS)),
  })
  .strict();

const Hex = z.string().regex(/^#[0-9a-f]{6}$/);
export const Colors = z
  .object({
    icon: z.array(Hex).length(28),
    rarity: z.array(Hex).length(12),
    sharpness: z.object({
      red: Hex,
      orange: Hex,
      yellow: Hex,
      green: Hex,
      blue: Hex,
      white: Hex,
      purple: Hex,
    }),
    unknown: z.array(Hex),
    _src: z.object({ file: z.string(), note: z.string() }),
  })
  .strict();

export const Item = z
  .object({
    id: z.number().int().nonnegative(),
    name: Text,
    desc: OptText,
    type: z.number().int(),
    subType: z.number().int(),
    rarity: Rarity,
    carry: z.number().int(),
    sort: z.number().int(),
    flags: z.number().int(),
    icon: Icon,
    price: z.object({ sell: z.number().int(), buy: z.number().int() }).strict(),
    _src: Src,
  })
  .strict();

const SkillLevel = z
  .object({
    level: z.number().int().min(1),
    desc: OptText,
    params: z.array(z.number().int()).length(4),
    unlockedBy: z.array(z.object({ skill: z.number().int(), level: z.number().int() }).strict()).optional(),
    _src: Src,
  })
  .strict();

export const Skill = z
  .object({
    id: z.number().int().nonnegative(),
    name: Text,
    reading: OptText,
    desc: OptText,
    setBonus: z.boolean(),
    iconColor: z.number().int().min(0),
    maxLevel: z.number().int().min(1),
    baseMaxLevel: z.number().int().min(1),
    levels: z.array(SkillLevel).min(1),
    _src: Src,
  })
  .strict();

export const Decoration = z
  .object({
    id: z.number().int(),
    name: Text,
    size: z.number().int().min(1).max(4),
    rarity: Rarity,
    skills: z.array(SkillRef).min(1).max(2),
    icon: Icon,
    _src: Src,
  })
  .strict();

const Points = z.object({ id: z.number().int(), points: z.number().int().min(1) }).strict();

export const Armor = z
  .object({
    id: z.number().int(),
    name: Text,
    desc: OptText,
    rarity: Rarity,
    skills: z.array(SkillRef).max(3),
    order: z.number().int(),
    slot: z.enum(['head', 'chest', 'arms', 'waist', 'legs']),
    variant: z.number().int(),
    series: z.object({ id: z.number().int(), name: OptText }).strict(),
    defense: z.number().int().nonnegative(),
    resist: z
      .object({
        fire: z.number().int(),
        water: z.number().int(),
        ice: z.number().int(),
        thunder: z.number().int(),
        dragon: z.number().int(),
      })
      .strict(),
    slots: Slots,
    setSkill: Points.optional(),
    hiddenSkill: Points.optional(),
    gender: z.number().int().min(0).max(3),
    group: z.number().int(),
    cost: z.number().int(),
    _src: Src,
  })
  .strict();

export const Charm = z
  .object({
    id: z.number().int(),
    name: Text,
    desc: OptText,
    rarity: Rarity,
    skills: z.array(SkillRef).max(3),
    order: z.number().int(),
    group: z.number().int(),
    iconColor: z.number().int(),
    _src: Src,
  })
  .strict();

export const Mantle = z
  .object({
    id: z.number().int().min(1),
    itemId: z.number().int(),
    name: Text,
    upgradedName: OptText,
    desc: OptText,
    slots: Slots,
    sort: z.number().int(),
    icon: Icon,
    _src: Src,
  })
  .strict();

export const ELEMENTS = ['fire', 'water', 'ice', 'thunder', 'dragon', 'poison', 'paralysis', 'sleep', 'blast'] as const;
const Element = z.object({ type: z.enum(ELEMENTS), value: z.number().int().positive() }).strict();

export const Weapon = z
  .object({
    id: z.number().int(),
    name: Text,
    desc: OptText,
    rarity: Rarity,
    attack: z.number().int().nonnegative(),
    affinity: z.number().int().min(-100).max(100),
    defense: z.number().int().nonnegative(),
    element: Element.nullable(),
    hiddenElement: Element.nullable(),
    elderseal: z.number().int().min(0).max(3),
    slots: Slots,
    skill: z.number().int().nullable(),
    tree: z.object({ id: z.number().int(), position: z.number().int() }).strict(),
    fixedUpgrade: z.boolean(),
    cost: z.number().int(),
    sharpness: z
      .object({
        id: z.number().int(),
        handicraftSteps: z.number().int(),
        bars: z.array(z.number().int().nonnegative()).length(7),
      })
      .strict()
      .optional(),
    ranged: z
      .object({
        shellType: z.number().int(),
        deviation: z.number().int(),
        specialAmmo: z.number().int(),
        parts: z.array(z.number().int()).length(4),
      })
      .strict()
      .optional(),
    /** 冥赤龙武器（可设定觉醒能力） */
    awakened: z.literal(true).optional(),
    /** 同名同数值的重复行，指向保留的那一条 */
    duplicateOf: z.number().int().optional(),
    _src: Src,
  })
  .strict();

export const WEAPON_TYPES = [
  'great-sword',
  'sword-and-shield',
  'dual-blades',
  'long-sword',
  'hammer',
  'hunting-horn',
  'lance',
  'gunlance',
  'switch-axe',
  'charge-blade',
  'insect-glaive',
  'bow',
  'heavy-bowgun',
  'light-bowgun',
] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

export const RANGED: ReadonlySet<WeaponType> = new Set(['bow', 'heavy-bowgun', 'light-bowgun']);

// ---------- 武器客制（weapon-custom.json） ----------

const Levels4 = z.array(z.number()).length(4);

export const AUGMENT_CATEGORIES = ['extend', 'attack', 'affinity', 'defense', 'slot', 'health', 'element'] as const;
export const AWAKENING_CATEGORIES = [
  'attack',
  'defense',
  'affinity',
  'element',
  'slot',
  'sharpness',
  'setBonus',
  'melody',
  'shelling',
  'saPhial',
  'cbPhial',
  'coating',
  'kinsect',
  'ammoNormal',
  'ammoPierce',
  'ammoSpread',
  'ammoElement',
  'recoil',
  'reload',
  'deviation',
  'status',
] as const;

export const WeaponCustom = z
  .object({
    augments: z
      .object({
        levels: z.array(
          z
            .object({
              id: z.number().int().positive(),
              category: z.enum(AUGMENT_CATEGORIES),
              level: z.number().int().min(1).max(4),
              slotCost: z.number().int().nonnegative(),
              name: Text,
              desc: OptText,
              zenny: z.record(z.enum(['10', '11', '12']), z.number().int().nonnegative()),
              _src: Src,
            })
            .strict(),
        ),
        effects: z
          .object({
            attack: Levels4,
            affinity: Levels4,
            defense: Levels4,
            defenseGuardChance: Levels4,
            defenseGuardRate: Levels4,
            healthRegenRate: Levels4,
            healthRegenCooldown: z.number(),
            element: Levels4,
            bowgunElementAmmo: Levels4,
            bowgunStatusAmmo: Levels4,
            elementMultiplier: z.record(z.enum(WEAPON_TYPES), z.number().positive()),
            bowCoatingStatus: Levels4,
            _src: z.object({ file: z.string(), offset: z.number().int() }).strict(),
          })
          .strict(),
      })
      .strict(),
    parts: z.record(
      z.enum(WEAPON_TYPES),
      z.array(
        z
          .object({
            id: z.number().int().positive(),
            stage: z.number().int().min(1).max(7),
            name: Text,
            desc: OptText,
            effect: z
              .object({
                attack: z.number().int().positive(),
                affinity: z.number().int().positive(),
                element: z.number().int().positive(),
                defense: z.number().int().positive(),
                sharpness: z.number().int().positive(),
              })
              .partial()
              .strict(),
            _src: Src,
          })
          .strict(),
      ),
    ),
    awakening: z.array(
      z
        .object({
          id: z.number().int().positive(),
          category: z.enum(AWAKENING_CATEGORIES),
          rank: z.number().int().min(1).max(6),
          name: Text,
          desc: OptText,
          weapons: z.array(z.enum(WEAPON_TYPES)).min(1),
          stackable: z.boolean(),
          onePerCategory: z.boolean(),
          setSkill: z.number().int().nullable(),
          next: z.number().int().nullable(),
          /** 各武器种上的效果值（em104lbr）；旋律、炮击等种类没有加值，为 null */
          value: z
            .object({
              kind: z.enum(['attack', 'defense', 'affinity', 'element', 'slotLevel', 'sharpness', 'status', 'ammo']),
              byWeapon: z.partialRecord(z.enum(WEAPON_TYPES), z.number().int().positive()),
            })
            .strict()
            .nullable(),
          _src: Src,
        })
        .strict(),
    ),
  })
  .strict();

export type WeaponCustom = z.infer<typeof WeaponCustom>;

/** 不在数据文件里、取自游戏程序的常量（constants.json） */
export const Constants = z
  .object({
    weaponBloat: z.record(z.enum(WEAPON_TYPES), z.number().positive()),
    critMultiplier: z.number().positive(),
    badCritMultiplier: z.number().positive(),
    _src: z.object({ file: z.literal('exe'), note: z.string() }).strict(),
  })
  .strict();
export type Constants = z.infer<typeof Constants>;
export type Meta = z.infer<typeof Meta>;
export type Colors = z.infer<typeof Colors>;
export type Item = z.infer<typeof Item>;
export type Skill = z.infer<typeof Skill>;
export type Decoration = z.infer<typeof Decoration>;
export type Armor = z.infer<typeof Armor>;
export type Charm = z.infer<typeof Charm>;
export type Mantle = z.infer<typeof Mantle>;
export type Weapon = z.infer<typeof Weapon>;
export type Text = z.infer<typeof Text>;

/** 每个文件的顶层键与记录结构 */
export const FILES = {
  'items.json': { key: 'items', schema: Item },
  'skills.json': { key: 'skills', schema: Skill },
  'decorations.json': { key: 'decorations', schema: Decoration },
  'armor.json': { key: 'armor', schema: Armor },
  'charms.json': { key: 'charms', schema: Charm },
  'mantles.json': { key: 'mantles', schema: Mantle },
  ...Object.fromEntries(WEAPON_TYPES.map((t) => [`weapons/${t}.json`, { key: 'weapons', schema: Weapon }])),
} as const satisfies Record<string, { key: string; schema: z.ZodType }>;

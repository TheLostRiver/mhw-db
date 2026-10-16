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
export const OptText = Text.partial();

export const Src = z
  .object({ file: z.string().startsWith('common/'), row: z.number().int().nonnegative() })
  .strict();
const Rarity = z.number().int().min(1).max(12);

/** 狩猎笛音色：echo 为残响音符 */
export const NOTES = ['purple', 'red', 'orange', 'yellow', 'green', 'blue', 'aqua', 'white', 'echo'] as const;
const Note = z.enum(NOTES);
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

/** 调和列表：category 0 药品、1 道具与陷阱、2 弹药与瓶（按内容归纳）；canAuto 含义未在游戏内核对 */
export const Combination = z
  .object({
    id: z.number().int().nonnegative(),
    materials: z.array(z.number().int().positive()).min(1).max(2),
    result: z.number().int().positive(),
    quantity: z.number().int().min(1),
    category: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    canAuto: z.boolean(),
    unk: z.number().int(),
    _src: Src,
  })
  .strict();
export const Combinations = z.object({ combinations: z.array(Combination).min(1) }).strict();

/** 素材：物品编号 × 个数 */
const Material = z.object({ item: z.number().int().positive(), count: z.number().int().positive() }).strict();
const MaterialList = z.array(Material);
/** 生产 / 强化配方：素材，强化还带下一级武器 */
const Upgrade = z.object({ materials: z.array(Material), to: z.array(z.number().int()) }).strict();

/** 猎虫（rod_insect.rod_inse + insect.eq_cus 培养树） */
export const Kinsect = z
  .object({
    id: z.number().int().nonnegative(),
    name: Text,
    attack: z.enum(['sever', 'blunt']),
    dust: z.enum(['blast', 'heal', 'paralysis', 'poison']),
    power: z.number().int().min(1).max(20),
    speed: z.number().int().min(1).max(20),
    heal: z.number().int().min(1).max(20),
    element: z.number().int().min(1).max(20),
    rarity: Rarity,
    cost: z.number().int().nonnegative(),
    series: z.object({ id: z.number().int(), name: OptText }).strict(),
    tier: z.number().int().min(1).max(3),
    column: z.number().int().nonnegative(),
    parent: z.number().int().nullable(),
    rank: z.enum(['low', 'high', 'master']).nullable(),
    materials: MaterialList,
    unlockMonster: z.number().int().positive().optional(),
    _src: Src,
  })
  .strict();
export type Kinsect = z.infer<typeof Kinsect>;

/** 狩猎笛旋律（music_skill.msk + music_skill_efc.mske） */
export const Melody = z
  .object({
    id: z.number().int().nonnegative(),
    name: Text,
    effect: OptText,
    encore: OptText,
    sequences: z.array(z.array(Note).min(2).max(4)).min(1),
    /** 持续秒数：基础 / 吹笛名人 1 / 2（名人两档为推断） */
    duration: z.tuple([z.number(), z.number(), z.number()]),
    extension: z.tuple([z.number(), z.number(), z.number()]),
    value: z.number(),
    valueEncore: z.number(),
    _src: z.object({ file: z.string(), effects: z.string(), row: z.number().int() }).strict(),
  })
  .strict();
export type Melody = z.infer<typeof Melody>;

/** 武器挂饰（charm.ch_dat + charm.eq_crt） */
export const Pendant = z
  .object({
    id: z.number().int().nonnegative(),
    name: Text,
    color: z.number().int().nonnegative(),
    /** 调查点数 */
    cost: z.number().int().nonnegative(),
    source: z.enum(['craft', 'reward', 'event']),
    materials: MaterialList,
    unlockMonster: z.number().int().positive().optional(),
    _src: Src,
  })
  .strict();
export type Pendant = z.infer<typeof Pendant>;

/** 幻化武器（customOuter*.cus_ou + customOuterRecipe.cus_otr） */
export const LayeredWeapon = z
  .object({
    id: z.number().int().positive(),
    name: Text,
    kind: z.enum(['base', 'parts', 'unique']),
    color: z.number().int().nonnegative(),
    sort: z.number().int().nonnegative(),
    cost: z.number().int().nonnegative(),
    materials: MaterialList,
    unlockMonster: z.number().int().positive().optional(),
    _src: Src,
  })
  .strict();
export type LayeredWeapon = z.infer<typeof LayeredWeapon>;

/** 幻化服装（armor-layered.json）：armor.am_dat 的 type 2，纯外观 */
export const LayeredArmor = z
  .object({
    id: z.number().int().positive(),
    name: Text,
    rarity: Rarity,
    slot: z.enum(['head', 'chest', 'arms', 'waist', 'legs']),
    variant: z.number().int(),
    series: z.object({ id: z.number().int(), name: OptText }).strict(),
    order: z.number().int(),
    cost: z.number().int().nonnegative(),
    materials: MaterialList,
    _src: Src,
  })
  .strict();
export type LayeredArmor = z.infer<typeof LayeredArmor>;
export type Combination = z.infer<typeof Combination>;

const SkillLevel = z
  .object({
    level: z.number().int().min(1),
    /** 套装技能每一档的名字（如「继承」） */
    name: Text.optional(),
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
    /** 生产素材（armor.eq_crt），空数组表示不是打造的（活动赠品等） */
    materials: z.array(Material),
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
    /** 生产素材（armor.eq_crt），空数组表示不是打造的 */
    materials: z.array(Material),
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

export const ELEMENTS = [
  'fire',
  'water',
  'ice',
  'thunder',
  'dragon',
  'poison',
  'paralysis',
  'sleep',
  'blast',
] as const;
const Element = z.object({ type: z.enum(ELEMENTS), value: z.number().int().positive() }).strict();
const coating = z.number().int().min(0).max(2);
/** 武器专属参数（见 docs/DATA.md 3.2）：铳枪炮击、斩击斧 / 盾斧的瓶、双属性双剑、弓的可用瓶（0 无 1 有 2 强化） */
const WeaponSpecial = z
  .object({
    shelling: z
      .object({ type: z.enum(['normal', 'long', 'wide']), level: z.number().int().min(1) })
      .strict()
      .optional(),
    phial: z
      .object({
        type: z.enum(['power', 'element', 'dragon', 'exhaust', 'paralysis', 'poison', 'impact']),
        value: z.number().int().min(0),
      })
      .strict()
      .optional(),
    elements: z.tuple([Element, Element]).optional(),
    coatings: z
      .object({
        close: coating,
        power: coating,
        paralysis: coating,
        poison: coating,
        sleep: coating,
        blast: coating,
      })
      .strict()
      .optional(),
    /** 狩猎笛的三个音色（wep_wsl） */
    notes: z.tuple([Note, Note, Note]).optional(),
    /** 操虫棍的猎虫加成 0–7（cm_status STATUS_ROD_SKILL_01…08） */
    kinsectBonus: z.number().int().min(0).max(7).optional(),
  })
  .strict();

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
    special: WeaponSpecial.optional(),
    /** 冥赤龙武器（可设定觉醒能力） */
    awakened: z.literal(true).optional(),
    /** 同名同数值的重复行，指向保留的那一条 */
    duplicateOf: z.number().int().optional(),
    /** 生产素材（weapon.eq_crt，只有铁/骨系根部有） */
    materials: z.array(Material).optional(),
    /** 强化素材与下一级武器（weapon.eq_cus） */
    upgrade: Upgrade.optional(),
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

export const AUGMENT_CATEGORIES = [
  'extend',
  'attack',
  'affinity',
  'defense',
  'slot',
  'health',
  'element',
] as const;
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
              /** 各稀有度的研究点数 */
              points: z.record(z.enum(['10', '11', '12']), z.number().int().nonnegative()),
              /** 各稀有度的素材（new_lbr）；缺少的稀有度不能做这一级 */
              materials: z.partialRecord(z.enum(['10', '11', '12']), z.array(Material).min(1)),
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
            hr: z
              .object({
                attack: z.array(z.number()).length(3),
                affinity: z.array(z.number()).length(3),
                defense: z.array(z.number()).length(3),
              })
              .strict(),
            _src: z.object({ file: z.string(), offset: z.number().int() }).strict(),
          })
          .strict(),
        /** 上位自定义强化（稀有度 6–8）与防具强化的解放费用、素材（lbm_base / lbm_skill） */
        hr: z
          .object({
            unlock: z.array(
              z
                .object({
                  weapon: z.enum(WEAPON_TYPES),
                  rarity: Rarity,
                  zenny: z.number().int().nonnegative(),
                  materials: z.array(Material),
                  _src: Src,
                })
                .strict(),
            ),
            materials: z.array(
              z
                .object({
                  rarity: Rarity,
                  augment: z.enum(['attack', 'affinity', 'defense', 'slot', 'health']),
                  materials: z.array(Material),
                  _src: Src,
                })
                .strict(),
            ),
            armor: z.array(
              z
                .object({
                  slot: z.enum(['head', 'chest', 'arms', 'waist', 'legs']),
                  rarity: Rarity,
                  zenny: z.number().int().nonnegative(),
                  materials: z.array(Material),
                  _src: Src,
                })
                .strict(),
            ),
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
            materials: z.array(Material).min(1),
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
              kind: z.enum([
                'attack',
                'defense',
                'affinity',
                'element',
                'slotLevel',
                'sharpness',
                'status',
                'ammo',
              ]),
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
    sharpness: z
      .object({
        raw: z.array(z.number().positive()).length(7),
        element: z.array(z.number().positive()).length(7),
      })
      .strict(),
    _src: z.object({ file: z.literal('exe'), note: z.string() }).strict(),
  })
  .strict();
export type Constants = z.infer<typeof Constants>;

/**
 * 大地图（maps.json）：每个区域一块羊皮纸纸片，位置由管线配准求出（见 pipeline/mhdb/images/world_maps.py）。
 * 地图坐标单位 = 纸片像素，原点与雷达原点重合；x 向右、y 向下。
 */
const Int = z.number().int();
export const MapPatch = z
  .object({
    letter: z.string().regex(/^[A-Q]$/),
    area: Int.min(1).max(17),
    /** 大地图的楼层（0 起），对应游戏地图的层切换 */
    layer: Int.min(0),
    /** 纸片画的雷达层 */
    floors: z.array(Int.min(0)),
    /** 图集里的矩形 (x, y, w, h) */
    rect: z.tuple([Int, Int, Int.positive(), Int.positive()]),
    /** 雷达坐标（左上角） */
    x: z.number(),
    y: z.number(),
    /** 地图坐标（左上角） */
    mapX: z.number(),
    mapY: z.number(),
    /** 区域号标签位置（纸片内像素） */
    label: z.tuple([Int, Int]),
    /** 配准得分（归一化互相关），偏低的位置需要人工确认 */
    score: z.number(),
  })
  .strict();
export const MapStage = z
  .object({
    id: Int,
    name: Text,
    group: z.enum(['field', 'special', 'base']),
    /** 雷达单位 / 纸片像素 */
    scale: z.number().positive(),
    layers: Int.min(1),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    thumb: z.string().nullable(),
    /** 纸片底下整幅插画在地图坐标里的 [x0, y0, x1, y1]（图片 stXXX/back.webp） */
    backdrop: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
    patches: z.array(MapPatch).min(1),
    _src: z.record(z.string(), z.string()),
  })
  .strict();
export const Maps = z.object({ stages: z.array(MapStage) }).strict();
export type MapPatch = z.infer<typeof MapPatch>;
export type MapStage = z.infer<typeof MapStage>;

/**
 * 大地图标记（map-nodes.json）：采集点等，由 pipeline/mhdb/build/world_nodes.py 从关卡布置文件导出。
 * 坐标与 maps.json 相同（纸片像素）。
 */
export const RANKS = ['low', 'high', 'master'] as const;
export const Rank = z.enum(RANKS);
const LotEntry = z.object({ item: Int.positive(), count: Int.min(1), weight: Int.min(0) }).strict();
export const MapNodeKind = z
  .object({
    /** 物件名，如 gm000_010_00 */
    key: z.string(),
    category: z.enum([
      'camp',
      'gather',
      'mining',
      'bonepile',
      'specialty',
      'bug',
      'creature',
      'endemic',
      'fishing',
      'env',
      'treasure',
      'npc',
      'slinger',
      'carry',
      'other',
    ]),
    /** 物件名称（gmk_names / animal_names）；采集点多数没有，用物品名 */
    name: Text.nullable(),
    /** 固定物品 */
    item: Int.positive().nullable(),
    /** 交互环境生物、环境利用的地图图标（cmn_action00 的格子编号） */
    actionIcon: Int.min(1).optional(),
    /** 交互环境生物、环境利用的说明（animal_names / gmk_names） */
    desc: Text.optional(),
    /** 寻宝：各处的线索（treasure_stXXX 的 _H0、_H1……），第 K 处对应第 K 条（按编号推断） */
    hints: z.array(Text).optional(),
    /** 抽选表行号（关卡 itlot），通常 / 第二组（用途未确认） */
    lots: z.array(Int.min(0)),
    /** 采集次数（营地、虫、投射器弹没有这一项） */
    gathers: Int.min(0).nullable(),
    /** 再生秒数（pop_base 的字段，含义按数值推断，未与游戏内计时核对） */
    respawn: z.number().min(0).nullable(),
    total: Int.min(1),
    _src: z.record(z.string(), z.string()),
  })
  .strict();
export const MapNode = z
  .object({
    kind: z.string(),
    x: z.number(),
    y: z.number(),
    /** 世界坐标高度 */
    h: Int,
    /** 物件的 floor 字段（多与雷达层一致） */
    floor: Int,
    /** 所在纸片的楼层与区域号；落在地图之外时为 null */
    layer: Int.min(0).nullable(),
    area: Int.min(1).nullable(),
    /** 只在这个环境状态（cm_quest 文本序号）下出现；常驻为 null */
    state: Int.nullable(),
    /** 从这个等级起才出现（stXXX_high.sobjl 加载的点为上位起，推断） */
    minRank: Rank.nullable(),
    /** 营地：mCampId 与营地名 */
    campId: Int.min(0).optional(),
    label: Text.nullable().optional(),
    /** 环境生物、虫：出现范围的四个角（地图坐标），节点位置是它的中心 */
    quad: z
      .array(z.tuple([z.number(), z.number()]))
      .length(4)
      .optional(),
    /** 钓点：能钓到的鱼（物品编号） */
    fish: z.array(Int.positive()).optional(),
    /** 寻宝：这一张的第几处（0 起） */
    step: Int.min(0).optional(),
    _src: z.object({ file: z.string().startsWith('stage/') }).strict(),
  })
  .strict();
export const MapNodeStage = z
  .object({
    id: Int,
    ranks: z.array(Rank).min(1),
    states: z.array(z.object({ id: Int, name: Text }).strict()).min(1),
    lots: z.partialRecord(Rank, z.record(z.string(), z.array(LotEntry))),
    _src: z.object({ lots: z.partialRecord(Rank, z.string()) }).strict(),
    kinds: z.array(MapNodeKind).min(1),
    nodes: z.array(MapNode).min(1),
  })
  .strict();
export const MapNodes = z.object({ stages: z.array(MapNodeStage) }).strict();
export type Rank = z.infer<typeof Rank>;
export type MapNodeKind = z.infer<typeof MapNodeKind>;
export type MapNode = z.infer<typeof MapNode>;
export type MapNodeStage = z.infer<typeof MapNodeStage>;

export type Meta = z.infer<typeof Meta>;
export type Colors = z.infer<typeof Colors>;
export type Item = z.infer<typeof Item>;
export type Skill = z.infer<typeof Skill>;
export type Decoration = z.infer<typeof Decoration>;
export type Armor = z.infer<typeof Armor>;
/**
 * 武器招式（moves.json）：hm/…/collision/*.col 的攻击参数，见 pipeline/mhdb/formats/col.py。
 * 名字为数据里的日文开发名（ja）与本站译名（zh，可能缺）；几个判定共用这条参数时，其余判定名在 aka。
 */
export const MOVE_GROUPS = ['melee', 'shell', 'claw', 'hunter', 'item'] as const;
export const Move = z
  .object({
    weapon: z.union([z.enum(WEAPON_TYPES), z.literal('common')]),
    group: z.enum(MOVE_GROUPS),
    file: z.string().startsWith('hm/'),
    i: z.number().int().min(0),
    ja: z.string(),
    zh: z.string().nullable(),
    aka: z.array(z.object({ ja: z.string(), zh: z.string().nullable() }).strict()).optional(),
    type: z.enum(['none', 'sever', 'blunt', 'shot']),
    mv: z.number(),
    fixed: z.number(),
    part: z.number(),
    ele: z.number(),
    status: z.number(),
    stun: z.number(),
    exhaust: z.number(),
    mount: z.number(),
    soften: z.number(),
    eye: z.boolean(),
    hitstop: z.number().min(0),
    hitstopB: z.number().min(0).optional(),
    noSharp: z.boolean(),
    energy: z.number(),
    condMv: z.number().optional(),
    condEle: z.number().optional(),
    elementType: z.number().int().min(0).optional(),
    fixedElement: z.number().optional(),
    fixedStatus: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    tranq: z.number().optional(),
  })
  .strict();
export const Moves = z.object({ moves: z.array(Move).min(1) }).strict();
export type Move = z.infer<typeof Move>;

/**
 * 大型怪物（monsters.json）：部位、肉质、异常耐性，见 pipeline/mhdb/build/world_monsters.py。
 * 肉质槽 hz 是 10 个肉质编号：上位及以下 5 个状态（通常、受伤、特殊 1–3）+ 大师级 5 个状态，-1 为该状态不存在
 * （大师级为 -1 时沿用上位）。
 */
export const HITZONE_KEYS = [
  'sever',
  'blunt',
  'shot',
  'fire',
  'water',
  'thunder',
  'ice',
  'dragon',
  'stun',
  'exhaust',
] as const;
const hzValue = z.number().int().min(0);
const Hitzone = z
  .object({
    sever: hzValue,
    blunt: hzValue,
    shot: hzValue,
    fire: hzValue,
    water: hzValue,
    thunder: hzValue,
    ice: hzValue,
    dragon: hzValue,
    stun: hzValue,
    exhaust: hzValue,
  })
  .strict();
const Buildup = z
  .object({
    base: z.number().int().min(0),
    increase: z.number().int().min(0),
    max: z.number().int().min(0),
    decayInterval: z.number().min(0),
    decay: z.number().int().min(0),
    duration: z.number().min(0),
    durationStep: z.number().min(0),
    durationMin: z.number().min(0),
  })
  .strict();
export const STAR_KEYS = [
  'fire',
  'water',
  'thunder',
  'ice',
  'dragon',
  'poison',
  'sleep',
  'paralysis',
  'blast',
  'stun',
] as const;
const star = z.number().int().min(-1).max(3);
const Stars = z
  .object({
    fire: star,
    water: star,
    thunder: star,
    ice: star,
    dragon: star,
    poison: star,
    sleep: star,
    paralysis: star,
    blast: star,
    stun: star,
  })
  .strict();
export const Monster = z
  .object({
    key: z.string().regex(/^em\d{3}_\d{2}$/),
    em: z.number().int(),
    sub: z.number().int(),
    gameId: z.number().int().min(0),
    name: Text.nullable(),
    desc: Text.nullable(),
    tips: Text.nullable(),
    icon: z.string().nullable(),
    hp: z.number().int().positive(),
    parts: z.array(
      z
        .object({
          label: z.string().min(1),
          flinch: z.number().int().min(0),
          extract: z.enum(['red', 'white', 'orange', 'green']).nullable(),
          sever: z.number().int().nullable(),
          slots: z
            .array(
              z
                .object({
                  label: z.string().min(1),
                  names: z.array(z.string()),
                  hz: z.array(z.number().int().min(-1)).length(10),
                })
                .strict(),
            )
            .min(1),
        })
        .strict(),
    ),
    hitzones: z.array(Hitzone).min(1),
    status: z
      .object({
        poison: Buildup,
        sleep: Buildup,
        paralysis: Buildup,
        stun: Buildup,
        exhaust: Buildup,
        mount: Buildup,
        blast: Buildup,
        blastDamage: z.number().int().min(0),
        exhaustDamage: z.number().min(0),
        /** 毒：每次的伤害与系数（Kiranico 的毒总伤 = 伤害 × 系数 × 持续秒；系数的含义未确认） */
        poisonDamage: z.object({ damage: z.number().int().min(0), coefficient: z.number().min(0) }).strict(),
        /** 捕获用麻醉的积累 */
        capture: Buildup,
        /** 龙封力的积累（只有古龙非 0） */
        elderseal: Buildup,
        traps: z
          .object({
            shock: z.array(z.number()),
            pitfall: z.array(z.number()),
            ivy: z.array(z.number()),
            dung: z.array(z.number()),
            /** 闪光（上位及以下）每次的持续秒数 */
            flash: z.array(z.number()),
          })
          .strict(),
      })
      .strict(),
    /** 狩猎笔记的星级；同一怪物有几条记录（等级或形态不同）时按文件顺序给出，对应关系未逐一确认 */
    stars: z.array(Stars),
    _src: z.object({ epg: z.string(), eda: z.string(), col: z.string(), note: z.string() }).strict(),
  })
  .strict();
export const Monsters = z.object({ monsters: z.array(Monster).min(1) }).strict();
export type Monster = z.infer<typeof Monster>;
export type Hitzone = z.infer<typeof Hitzone>;
export type Buildup = z.infer<typeof Buildup>;

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
  'kinsects.json': { key: 'kinsects', schema: Kinsect },
  'melodies.json': { key: 'melodies', schema: Melody },
  'pendants.json': { key: 'pendants', schema: Pendant },
  'armor-layered.json': { key: 'layered', schema: LayeredArmor },
  ...Object.fromEntries(WEAPON_TYPES.map((t) => [`weapons/${t}.json`, { key: 'weapons', schema: Weapon }])),
} as const satisfies Record<string, { key: string; schema: z.ZodType }>;

/** weapon-layered.json：武器种 → 幻化外观 */
export const LayeredWeapons = z.record(z.enum(WEAPON_TYPES), z.array(LayeredWeapon).min(1));

/**
 * 任务与怪物报酬（quests.json、monster-rewards.json，见 pipeline/mhdb/build/world_quests.py 与 docs/DATA.md 3.9）。
 */
import { z } from 'zod';
import { OptText, Text } from './schema';

const Id = z.number().int().positive();
const Weighted = z
  .object({ item: Id, count: z.number().int().positive(), weight: z.number().int().nonnegative() })
  .strict();
const Objective = z
  .object({
    type: z.enum(['hunt', 'slay', 'capture', 'deliver', 'all']),
    /** 怪物编号（deliver 为物品编号，all 为 0） */
    target: z.number().int().nonnegative(),
    count: z.number().int().positive(),
  })
  .strict();

export const Quest = z
  .object({
    id: z.number().int().nonnegative(),
    name: Text,
    objective: OptText,
    failure: OptText,
    client: OptText,
    desc: OptText,
    subObjective: OptText,
    rank: z.enum(['low', 'high', 'master']),
    stars: z.number().int().min(1).max(9),
    map: z.number().int(),
    mapName: OptText.optional(),
    time: z.number().int().positive(),
    reward: z.number().int().nonnegative(),
    faints: z.number().int().positive().nullable(),
    hrPoints: z.number().int().nonnegative(),
    hrRestrict: z.number().int().nonnegative(),
    objectives: z.array(Objective),
    subObjectives: z.array(Objective),
    monsters: z.array(
      z
        .object({
          id: z.number().int().nonnegative(),
          /** em_difficulty 单人表的倍率；体力 = 基础体力 × hp */
          hp: z.number().nonnegative(),
          atk: z.number().nonnegative(),
          plDmg: z.number().nonnegative(),
          partHp: z.number().nonnegative(),
          _rows: z.object({ hp: z.number().int(), atk: z.number().int() }).strict(),
        })
        .strict(),
    ),
    /** 3–4 人时体力再乘的倍率（多人表） */
    multiHp: z.number().nonnegative(),
    rewards: z.array(Id),
    supply: z.array(z.object({ item: Id, count: z.number().int().positive() }).strict()).optional(),
    _src: z.object({ file: z.string(), text: z.string() }).strict(),
  })
  .strict();
export type Quest = z.infer<typeof Quest>;

export const RewardTable = z
  .object({ id: Id, flag: z.number().int(), items: z.array(Weighted) })
  .strict();
export type RewardTable = z.infer<typeof RewardTable>;

export const Quests = z
  .object({
    quests: z.array(Quest).min(1),
    rewards: z.array(RewardTable).min(1),
    /** 怪物编号 → 键与名称（小型怪也在内） */
    monsters: z.record(z.string(), z.object({ key: z.string(), name: Text }).strict()),
  })
  .strict();
export type Quests = z.infer<typeof Quests>;

export const MonsterReward = z
  .object({
    rank: z.enum(['low', 'high', 'master']),
    em: z.string().regex(/^em\d{3}_\d{2}$/),
    /** 0 捕获、1–9 部位破坏、10 狩猎、11–14 指引之地、15 调查 */
    slot: z.number().int().min(0).max(20),
    /** em_parts 文本，%s 处填怪物名 */
    label: OptText,
    guidingLands: z.boolean(),
    items: z.array(Weighted).min(1),
    _src: z.object({ file: z.string() }).strict(),
  })
  .strict();
export type MonsterReward = z.infer<typeof MonsterReward>;
export const MonsterRewards = z.object({ rewards: z.array(MonsterReward).min(1) }).strict();

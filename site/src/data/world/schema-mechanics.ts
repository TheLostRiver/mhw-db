/**
 * 隐藏数值（mechanics.json，见 pipeline/mhdb/build/world_mechanics.py 与 docs/DATA.md 3.10）。
 */
import { z } from 'zod';
import { WEAPON_TYPES } from './schema';

const N = z.number();
const Twenty = z.array(N).length(20);

export const Mechanics = z
  .object({
    evade: z
      .object({
        frames: z.array(N).length(6),
        mantle: N,
        _src: z.object({ file: z.string(), offset: z.number().int() }).strict(),
      })
      .strict(),
    skills: z
      .object({
        weaknessExploitHitzone: z.number().int(),
        heroicsHealth: N,
        bludgeoner: z.object({ sharpness: z.array(z.number().int()).length(7), bowgunMelee: z.number().int() }).strict(),
        slide: z.object({ duration: N, affinity: z.number().int() }).strict(),
        _src: z.object({ file: z.string(), offsets: z.array(z.number().int()) }).strict(),
      })
      .strict(),
    frostcraft: z
      .object({
        multipliers: z.record(z.enum(WEAPON_TYPES), z.array(N).length(4)),
        segments: z.array(z.number().int()).length(3),
        _src: z.object({ file: z.string(), offset: z.number().int() }).strict(),
      })
      .strict(),
    kinsect: z
      .object({
        extractDuration: z.object({ red: N, white: N, orange: N, triple: N }).strict(),
        extractAttack: z.object({ redWhite: N, triple: N }).strict(),
        bonus: z
          .object({ sever: N, blunt: N, element: N, speed: N, heal: N, recallStamina: N })
          .strict(),
        dustInterval: z.object({ blast: N, heal: N, paralysis: N, poison: N }).strict(),
        levels: z
          .object({ power: Twenty, speed: Twenty, heal: Twenty, blast: Twenty, paralysis: Twenty, poison: Twenty })
          .strict(),
        _src: z.object({ file: z.string(), offsets: z.array(z.number().int()) }).strict(),
      })
      .strict(),
  })
  .strict();
export type Mechanics = z.infer<typeof Mechanics>;

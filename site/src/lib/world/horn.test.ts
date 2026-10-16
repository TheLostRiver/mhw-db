import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Melody } from '../../data/world/schema';
import { canPlay, canPlaySequence } from './horn';

describe('狩猎笛可用旋律', () => {
  it('音序里的音符都在三个音色之内才能吹奏，残响不计', () => {
    expect(canPlaySequence(['white', 'red', 'red'], ['white', 'red', 'aqua'])).toBe(true);
    expect(canPlaySequence(['white', 'blue', 'blue'], ['white', 'red', 'aqua'])).toBe(false);
    expect(canPlaySequence(['echo', 'aqua'], ['white', 'red', 'aqua'])).toBe(true);
    expect(canPlaySequence(['echo', 'green'], ['white', 'red', 'aqua'])).toBe(false);
  });

  it('紫红蓝的旋律与公开资料（Fextralife）一致', () => {
    const path = fileURLToPath(new URL('../../../../data/world/melodies.json', import.meta.url));
    const melodies = (JSON.parse(readFileSync(path, 'utf-8')) as { melodies: Melody[] }).melodies;
    const names = melodies.filter((m) => canPlay(m, ['purple', 'red', 'blue'])).map((m) => m.name['zh-Hans']);
    expect(names.sort()).toEqual(
      [
        '自我强化',
        '攻击力提升【大】',
        '体力提升【大】',
        '风压无效',
        '防御力提升【大】',
        '响周波【打】',
        '提升耐力最大值＆回复',
      ].sort(),
    );
  });
});

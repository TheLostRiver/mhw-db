import { describe, expect, it } from 'vitest';
import { plainText, textSegments } from './text';

describe('游戏文本标记', () => {
  it('拆分强调色片段', () => {
    expect(textSegments('赋予系列技能。[yellow]（不可设定复数个）[/]')).toEqual([
      { text: '赋予系列技能。' },
      { text: '（不可设定复数个）', color: 'yellow' },
    ]);
  });

  it('去掉标记', () => {
    expect(plainText('a[yellow]b[/]c[red]d[/]')).toBe('abcd');
    expect(plainText(undefined)).toBe('');
  });
});

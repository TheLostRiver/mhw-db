import { describe, expect, it } from 'vitest';
import { emptyBuild, type Build } from './builder';
import { buildFromHash, decodeBuild, encodeBuild, shareUrl } from './share';

const sample = (): Build => {
  const b = emptyBuild('long-sword');
  b.weapon = { id: 180, decos: [12, null, 7] };
  b.armor.head = { id: 1500, decos: [3] };
  b.armor.legs = { id: 1777, decos: [null, 9] };
  b.charm = 3300;
  b.mantles = [
    { id: 4, decos: [1, 2] },
    { id: null, decos: [] },
  ];
  b.mantleActive = true;
  b.custom = { augments: [5, 9], hr: ['attack', null], parts: [3, null, 4], awakening: [10, null] };
  b.conditions = ['agitator', 'weakness'];
  return b;
};

describe('配装分享编码', () => {
  it('编码后解码得到同一配装', () => {
    const b = sample();
    expect(decodeBuild(encodeBuild(b))).toEqual(b);
    expect(decodeBuild(encodeBuild(emptyBuild()))).toEqual(emptyBuild());
  });

  it('编码只含 URL 安全字符', () => {
    expect(encodeBuild(sample())).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(shareUrl('https://mhdb.helsincy.com', sample())).toMatch(
      /^https:\/\/mhdb\.helsincy\.com\/world\/builder\/#b=/,
    );
  });

  it('坏数据返回 null 或丢掉不合法的项', () => {
    expect(decodeBuild('!!!')).toBeNull();
    expect(decodeBuild(btoa('[2,"bow"]'))).toBeNull();
    const weird = btoa(
      JSON.stringify([1, 'bow', ['x', [1, 'y']], 'no', -3, null, 0, [[1, 'a'], ['bogus'], [], []], [1]]),
    );
    const b = decodeBuild(weird.replace(/=+$/, ''))!;
    expect(b.weaponType).toBe('bow');
    expect(b.weapon).toEqual({ id: null, decos: [1, null] });
    expect(b.charm).toBeNull();
    expect(b.custom.augments).toEqual([1]);
    expect(b.custom.hr).toEqual([null]);
    expect(b.conditions).toEqual([]);
  });

  it('从地址片段读取', () => {
    const b = sample();
    expect(buildFromHash(`#b=${encodeBuild(b)}`)).toEqual(b);
    expect(buildFromHash('#other')).toBeNull();
  });
});

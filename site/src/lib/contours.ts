/**
 * 程序生成的等高线（方向 C 的背景纹理）。纯函数、固定种子，构建期输出 SVG path。
 */

export interface ContourOptions {
  width: number;
  height: number;
  /** 山峰数量 */
  peaks?: number;
  /** 每座山的等高线圈数 */
  rings?: number;
  seed?: number;
}

/** mulberry32：小而稳定的种子随机数 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 极坐标扰动圆 → 闭合平滑路径（Catmull-Rom 转三次贝塞尔） */
export function ringPath(
  cx: number,
  cy: number,
  radius: number,
  harmonics: { k: number; amp: number; phase: number }[],
  samples = 48,
): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    let r = radius;
    for (const h of harmonics) r += radius * h.amp * Math.sin(h.k * t + h.phase);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.72]);
  }
  const at = (i: number) => pts[(i + samples) % samples]!;
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < samples; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0]!)} ${f(c1[1]!)} ${f(c2[0]!)} ${f(c2[1]!)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

export function contours({ width, height, peaks = 4, rings = 9, seed = 7 }: ContourOptions): string[] {
  const rand = rng(seed);
  const paths: string[] = [];
  for (let p = 0; p < peaks; p++) {
    const cx = width * (0.1 + rand() * 0.8);
    const cy = height * (0.1 + rand() * 0.8);
    const harmonics = Array.from({ length: 4 }, (_, i) => ({
      k: i + 2,
      amp: (0.06 + rand() * 0.07) / (i + 1),
      phase: rand() * Math.PI * 2,
    }));
    const step = Math.min(width, height) * (0.035 + rand() * 0.02);
    for (let r = 1; r <= rings; r++) {
      const drift = harmonics.map((h) => ({ ...h, phase: h.phase + r * 0.12, amp: h.amp * (1 + r * 0.05) }));
      paths.push(ringPath(cx, cy, step * r, drift));
    }
  }
  return paths;
}

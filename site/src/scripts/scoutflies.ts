/**
 * 首页的导虫：一群发光的小光点在画布上漂游，跟随指针；悬停某个路标时大部分导虫飞去绕着它转。
 * 页面不可见或画布离开视口时暂停；prefers-reduced-motion 时只画一帧静态画面。
 */

interface Fly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  /** 0–1：被路标吸引的程度（每只不同，聚集时有疏有密） */
  loyalty: number;
}

export interface Swarm {
  /** 让导虫聚向某点（画布坐标，CSS 像素）；传 null 恢复自由漂游 */
  focus(point: { x: number; y: number } | null): void;
  destroy(): void;
}

export function startScoutflies(canvas: HTMLCanvasElement): Swarm {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { focus() {}, destroy() {} };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flies: Fly[] = [];
  let w = 0;
  let h = 0;
  let pointer: { x: number; y: number } | null = null;
  let target: { x: number; y: number } | null = null;
  let raf = 0;
  let visible = true;
  let last = performance.now();

  const color = () => getComputedStyle(canvas).getPropertyValue('--fly').trim() || '#5cf2b4';
  let rgb = '92, 242, 180';
  const readColor = () => {
    const c = color();
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    rgb = m ? [m[1], m[2], m[3]].map((x) => parseInt(x!, 16)).join(', ') : rgb;
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const want = Math.round(Math.min(90, Math.max(28, (w * h) / 16000)));
    while (flies.length < want) {
      flies.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        phase: Math.random() * Math.PI * 2,
        size: 0.8 + Math.random() * 1.8,
        loyalty: 0.35 + Math.random() * 0.65,
      });
    }
    flies.length = want;
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const dark = document.documentElement.dataset.theme !== 'light';
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const f of flies) {
      const pulse = 0.55 + 0.45 * Math.sin(t / 700 + f.phase);
      const r = f.size * (dark ? 7 : 5);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(${rgb}, ${(dark ? 0.95 : 0.8) * pulse})`);
      g.addColorStop(0.25, `rgba(${rgb}, ${(dark ? 0.35 : 0.25) * pulse})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const step = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    for (const [i, f] of flies.entries()) {
      // 漂游：缓慢转向的随机力
      const a = Math.sin(t / 2300 + f.phase * 3) + Math.cos(t / 3100 + i);
      f.vx += Math.cos(a * 2 + f.phase) * 14 * dt;
      f.vy += Math.sin(a * 2 + f.phase) * 14 * dt;
      const goal = target ?? pointer;
      if (goal) {
        // 绕着目标转：切向 + 向心，各只半径不同
        const dx = goal.x - f.x;
        const dy = goal.y - f.y;
        const d = Math.hypot(dx, dy) || 1;
        const ring = target ? 26 + (1 - f.loyalty) * 70 : 60 + f.loyalty * 120;
        const pull = (target ? 90 : 18) * f.loyalty;
        const k = (d - ring) / d;
        f.vx += (dx * k * pull * dt) / 60 + (-dy / d) * 30 * f.loyalty * dt;
        f.vy += (dy * k * pull * dt) / 60 + (dx / d) * 30 * f.loyalty * dt;
      }
      const damp = Math.pow(target ? 0.2 : 0.55, dt);
      f.vx *= damp;
      f.vy *= damp;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      // 出界从另一边绕回
      if (f.x < -20) f.x = w + 20;
      if (f.x > w + 20) f.x = -20;
      if (f.y < -20) f.y = h + 20;
      if (f.y > h + 20) f.y = -20;
    }
    draw(t);
    raf = visible && !document.hidden ? requestAnimationFrame(step) : 0;
  };

  const run = () => {
    if (reduce || raf || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(step);
  };

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onLeave = () => (pointer = null);
  const ro = new ResizeObserver(() => {
    resize();
    if (reduce) draw(0);
  });
  const io = new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting;
    run();
  });
  const onVis = () => run();
  const themeObserver = new MutationObserver(() => {
    readColor();
    if (reduce) draw(0);
  });

  readColor();
  resize();
  ro.observe(canvas);
  io.observe(canvas);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const host = canvas.parentElement ?? canvas;
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVis);
  if (reduce) draw(0);
  else run();

  return {
    focus(point) {
      target = point;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

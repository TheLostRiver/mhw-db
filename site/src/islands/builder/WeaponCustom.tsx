/**
 * 武器客制面板：大师自定义强化（每种选一个等级 + 扩充自定义栏）、零件强化（每阶段一个零件）、冥赤龙觉醒能力（5 栏）、
 * 上位自定义强化（每格选一种，同种可重复）。页头左右翻页切换「自定义强化 / 零件强化」，容量用游戏里的六角格表示。
 * 还能继续强化的武器没有客制；不支援零件强化的武器没有零件强化页（见 lib/world/builder.ts 的 customKind / partsAvailable）。
 * 规则与数值的确认状态见 docs/DATA.md 3.3；未确认的部分只显示、不计入状态。
 */
import { useState, type ReactNode } from 'react';
import {
  EXTEND_LEVELS,
  HR_AUGMENTS,
  HR_AUGMENT_SLOTS,
  PART_STAGES,
  augmentBase,
  augmentCapacity,
  augmentCost,
  augmentLevels,
  partsAvailable,
  awakeningTotal,
  chosenAwakening,
  chosenParts,
  customKind,
  extendLevel,
  hrCounts,
  partTotals,
  type AugmentCategory,
  type AwakeningData,
  type Build,
  type HrAugment,
  type Index,
  type PartEffectKey,
  type WeaponCustom,
  type WeaponData,
} from '../../lib/world/builder';
import Dropdown from './Dropdown';
import { GameIcon, iconUrl } from './icons';

export const AUGMENT_NAMES: Record<AugmentCategory, string> = {
  attack: '攻击力强化',
  affinity: '会心率强化',
  defense: '防御力强化',
  slot: '镶嵌槽强化',
  health: '赋予回复能力',
  element: '属性·状态异常强化',
  extend: '扩充自定义栏',
};

/** 客制项目在面板上显示的顺序（扩充自定义栏单独排在最后） */
const PANEL_ORDER: AugmentCategory[] = ['attack', 'affinity', 'element', 'defense', 'slot', 'health'];

export const AWAKENING_GROUPS: Record<string, string> = {
  attack: '基础',
  defense: '基础',
  affinity: '基础',
  element: '基础',
  slot: '基础',
  sharpness: '基础',
  status: '基础',
  setBonus: '系列技能',
};

const PART_LABELS: Record<PartEffectKey, string> = {
  attack: '攻击',
  affinity: '会心',
  element: '属性',
  defense: '防御',
  sharpness: '锐利度',
};

export const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];

/** 觉醒能力在当前武器种上的效果说明（攻击 / 属性为真实值） */
export function awakeningEffectText(a: AwakeningData): string | null {
  const e = a.effect;
  if (!e) return null;
  switch (e.kind) {
    case 'attack':
      return `攻击 +${e.amount}`;
    case 'affinity':
      return `会心 +${e.amount}%`;
    case 'defense':
      return `防御 +${e.amount}`;
    case 'element':
      return `属性 +${e.amount * 10}`;
    case 'status':
      return `状态异常 +${e.amount * 10}`;
    case 'slotLevel':
      return `追加 ${e.amount} 级镶嵌槽`;
    case 'sharpness':
      return `锐利度 +${e.amount}（单位待确认）`;
    case 'ammo':
      return `装填数 +${e.amount}`;
  }
}

const partEffectText = (effect: { [K in PartEffectKey]?: number | undefined }) =>
  (Object.entries(effect) as [PartEffectKey, number | undefined][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${PART_LABELS[k]} +${v}`)
    .join('、');

interface Props {
  weapon: WeaponData;
  build: Build;
  idx: Index;
  onAugment: (category: AugmentCategory, level: number) => void;
  onCustom: (fn: (c: WeaponCustom) => WeaponCustom) => void;
  onPickAwakening: (slot: number) => void;
}

export default function WeaponCustomPanel({
  weapon,
  build,
  idx,
  onAugment,
  onCustom,
  onPickAwakening,
}: Props) {
  const kind = customKind(weapon);
  if (kind === 'awakening')
    return <AwakeningPanel build={build} idx={idx} onPick={onPickAwakening} onCustom={onCustom} />;
  if (kind === 'augment')
    return (
      <MrCustomPanel weapon={weapon} build={build} idx={idx} onAugment={onAugment} onCustom={onCustom} />
    );
  if (kind === 'hr') return <HrAugmentPanel weapon={weapon} build={build} idx={idx} onCustom={onCustom} />;
  return (
    <section className="gb-custom" aria-label="武器客制">
      <CustomHead title="武器客制" />
      <p className="gb-note">
        {weapon.canUpgrade && weapon.rarity >= 6
          ? '这把武器还能继续强化。游戏里要强化到衍生上限，才能进行自定义强化。'
          : '这把武器没有自定义强化（上位为稀有度 6–8，大师为稀有度 10–12）。'}
      </p>
    </section>
  );
}

/**
 * 客制面板的页头：标题居中，左右箭头在几页之间切换（游戏的强化画面也是这样翻页），右侧放容量。
 * pages 少于两页时不显示箭头。
 */
function CustomHead<T extends string>({
  title,
  pages,
  page,
  onPage,
  extra,
}: {
  title: string;
  pages?: { key: T; label: string }[] | undefined;
  page?: T;
  onPage?: (p: T) => void;
  extra?: ReactNode;
}) {
  const list = pages ?? [];
  const i = list.findIndex((p) => p.key === page);
  const at = (d: number) => list[(i + d + list.length) % list.length];
  const paged = list.length > 1 && i >= 0;
  return (
    <header className="gb-cus-head">
      {paged && (
        <button
          type="button"
          className="gb-cus-head__nav"
          aria-label={`上一页：${at(-1)?.label ?? ''}`}
          onClick={() => onPage?.(at(-1)!.key)}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M7.5 2 3.5 6l4 4" />
          </svg>
        </button>
      )}
      <h3 className="gb-cus-head__title">
        {title}
        {paged && (
          <span className="gb-cus-head__dots" aria-hidden="true">
            {list.map((p) => (
              <i key={p.key} data-on={p.key === page ? '' : undefined} />
            ))}
          </span>
        )}
      </h3>
      {paged && (
        <button
          type="button"
          className="gb-cus-head__nav"
          aria-label={`下一页：${at(1)?.label ?? ''}`}
          onClick={() => onPage?.(at(1)!.key)}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="m4.5 2 4 4-4 4" />
          </svg>
        </button>
      )}
      {extra != null && <span className="gb-cus-head__extra">{extra}</span>}
    </header>
  );
}

/** 格子栏里各项目的颜色（自定，按项目图标的主色挑选） */
const AUGMENT_COLORS: Record<AugmentCategory, string> = {
  attack: '#d65a45',
  affinity: '#a982e0',
  element: '#dcae3a',
  defense: '#c98b46',
  slot: '#4cb3c9',
  health: '#6cc36a',
  extend: '#9aa0a6',
};

/**
 * 自定义强化的格子栏：仿游戏强化画面的深色底条（两端箭头收口），格子贴图取自游戏（limit_break_EX.gui）。
 * 已占用的格子按占用它的项目着色；要「扩充自定义栏」才开出来的格子半透明，超出上限的占用标红。
 * focus 为鼠标所在的项目：它占的格子高亮，其余变暗。
 */
function AugmentBar({
  fill,
  capacity,
  full,
  focus,
}: {
  fill: AugmentCategory[];
  capacity: number;
  full: number;
  focus: AugmentCategory | null;
}) {
  const cells = Math.max(full, fill.length);
  return (
    <div
      className="gb-exbar"
      role="img"
      data-focus={focus && fill.includes(focus) ? '' : undefined}
      aria-label={`自定义强化格子：占用 ${fill.length} / ${capacity} 格，全部扩充后 ${full} 格`}
    >
      {Array.from({ length: cells }, (_, i) => {
        const c = fill[i];
        return (
          <span
            key={i}
            className="gb-exbar__cell"
            data-used={c ? '' : undefined}
            data-locked={i >= capacity ? '' : undefined}
            data-hl={c && c === focus ? '' : undefined}
            style={c ? { ['--hex' as string]: AUGMENT_COLORS[c] } : undefined}
            title={c ? AUGMENT_NAMES[c] : i >= capacity ? '扩充自定义栏后可用' : '空格'}
          >
            <img src={iconUrl.augmentHex(false)} width={28} height={28} alt="" decoding="async" />
            <i className="gb-exbar__fill" />
          </span>
        );
      })}
    </div>
  );
}

/** 等级调节：− / 等级格 / ＋。等级格可直接点选；不能选的等级（格数不足等）禁用，原因写在提示里 */
function LevelStepper({
  name,
  levels,
  current,
  blocked,
  onSet,
}: {
  name: string;
  levels: { level: number; title: string }[];
  current: number;
  blocked: (level: number) => string | null;
  onSet: (level: number) => void;
}) {
  const next = levels.find((l) => l.level === current + 1);
  const nextWhy = next ? blocked(next.level) : '已是最高等级';
  return (
    <span className="gb-step" role="group" aria-label={name}>
      <button
        type="button"
        className="gb-step__btn"
        aria-label={`${name}：降一级`}
        disabled={current === 0}
        onClick={() => onSet(current - 1)}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 6h7" />
        </svg>
      </button>
      <span className="gb-step__pips" role="radiogroup" aria-label={`${name}等级`}>
        {levels.map((l) => {
          const why = l.level === current ? null : blocked(l.level);
          return (
            <button
              key={l.level}
              type="button"
              role="radio"
              aria-checked={l.level === current}
              aria-label={`${ROMAN[l.level]} 级`}
              data-on={l.level <= current ? '' : undefined}
              disabled={why != null}
              title={why ?? l.title}
              onClick={() => onSet(l.level)}
            />
          );
        })}
      </span>
      <button
        type="button"
        className="gb-step__btn"
        aria-label={`${name}：升一级`}
        disabled={nextWhy != null}
        title={nextWhy ?? next?.title}
        onClick={() => onSet(current + 1)}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 6h7M6 2.5v7" />
        </svg>
      </button>
    </span>
  );
}

/** 大师自定义强化 + 零件强化：页头左右翻页；不支援零件强化的武器只有自定义强化一页 */
function MrCustomPanel({
  weapon,
  build,
  idx,
  onAugment,
  onCustom,
}: {
  weapon: WeaponData;
  build: Build;
  idx: Index;
  onAugment: (c: AugmentCategory, level: number) => void;
  onCustom: (fn: (c: WeaponCustom) => WeaponCustom) => void;
}) {
  const [tab, setTab] = useState<'augment' | 'parts'>('augment');
  const hasParts = partsAvailable(weapon) && idx.parts.size > 0;
  const page = hasParts ? tab : 'augment';
  const used = augmentCost(build, idx);
  const capacity = augmentCapacity(weapon, extendLevel(build, idx));
  return (
    <section className="gb-custom" aria-label={page === 'augment' ? '自定义强化' : '零件强化'}>
      <CustomHead
        title={page === 'augment' ? '自定义强化' : '零件强化'}
        pages={
          hasParts
            ? [
                { key: 'augment' as const, label: '自定义强化' },
                { key: 'parts' as const, label: '零件强化' },
              ]
            : undefined
        }
        page={page}
        onPage={setTab}
        extra={
          page === 'augment' ? (
            <span
              className="gb-custom__cost"
              title="上限随扩充自定义栏增加（稀有度 10 / 11 / 12 最大 9 / 8 / 6）"
            >
              占用 <b data-over={used > capacity ? '' : undefined}>{used}</b> / {capacity} 格
            </span>
          ) : (
            <span className="gb-custom__cost">{PART_STAGES} 阶段</span>
          )
        }
      />
      {!hasParts && <p className="gb-custom__hint">此武器不支援零件强化。</p>}
      {page === 'augment' ? (
        <AugmentPanel weapon={weapon} build={build} idx={idx} onAugment={onAugment} />
      ) : (
        <PartsPanel build={build} idx={idx} onCustom={onCustom} />
      )}
    </section>
  );
}

const HR_NAMES: Record<HrAugment, string> = {
  attack: '强化攻击力',
  affinity: '强化会心率',
  defense: '强化防御力',
  slot: '强化镶嵌槽',
  health: '赋予回复能力',
};

/** 上位自定义强化：每格选一种，同种可重复；加值按次数累计 */
function HrAugmentPanel({
  weapon,
  build,
  idx,
  onCustom,
}: {
  weapon: WeaponData;
  build: Build;
  idx: Index;
  onCustom: (fn: (c: WeaponCustom) => WeaponCustom) => void;
}) {
  const slots = HR_AUGMENT_SLOTS[weapon.rarity] ?? 0;
  const counts = hrCounts(build, idx);
  const fx = idx.effects.hr;
  const total = (a: HrAugment): string | null => {
    const n = counts.get(a) ?? 0;
    if (!n) return null;
    if (a === 'attack') return `攻击 +${fx.attack[n - 1] ?? 0}`;
    if (a === 'affinity') return `会心 +${fx.affinity[n - 1] ?? 0}%`;
    if (a === 'defense') return `防御 +${fx.defense[n - 1] ?? 0}`;
    if (a === 'slot') return `追加 ${Math.min(n, 3)} 级镶嵌槽`;
    return `回复能力 ×${n}`;
  };
  const set = (i: number, a: HrAugment | null) =>
    onCustom((c) => {
      const hr = [...c.hr];
      while (hr.length <= i) hr.push(null);
      hr[i] = a;
      return { ...c, hr };
    });

  return (
    <section className="gb-custom" aria-label="自定义强化">
      <CustomHead
        title="自定义强化"
        extra={
          <span className="gb-custom__cost" title="上位格数按稀有度 6 / 7 / 8 = 3 / 2 / 1，待确认">
            {slots} 格
          </span>
        }
      />
      <ol className="gb-parts">
        {Array.from({ length: slots }, (_, i) => (
          <li key={i}>
            <span className="gb-parts__row">
              <span className="gb-parts__stage" id={`gb-hr-${i}`}>
                第 {i + 1} 格
              </span>
              <Dropdown<HrAugment | null>
                labelledBy={`gb-hr-${i}`}
                value={build.custom.hr[i] ?? null}
                options={[
                  { value: null, label: '—', text: '无' },
                  ...HR_AUGMENTS.map((a) => ({
                    value: a,
                    label: HR_NAMES[a],
                    icon: <GameIcon src={iconUrl.augment(a)} size={18} />,
                  })),
                ]}
                onChange={(v) => set(i, v)}
              />
            </span>
          </li>
        ))}
      </ol>
      <p className="gb-note">
        {HR_AUGMENTS.map(total).filter(Boolean).join('、') || '同一项可以重复强化，效果按次数累计。'}
      </p>
    </section>
  );
}

function AugmentPanel({
  weapon,
  build,
  idx,
  onAugment,
}: {
  weapon: WeaponData;
  build: Build;
  idx: Index;
  onAugment: (c: AugmentCategory, level: number) => void;
}) {
  const [focus, setFocus] = useState<AugmentCategory | null>(null);
  const chosen = augmentLevels(build, idx);
  const extend = extendLevel(build, idx);
  const capacity = augmentCapacity(weapon, extend);
  const base = augmentBase(weapon);
  // 格子按「全部扩充后」的总数画，没开出来的格子一眼能看出来
  const full = augmentCapacity(weapon, EXTEND_LEVELS);
  const used = augmentCost(build, idx);
  const levels = [...idx.augments.values()];
  const fx = idx.effects;
  const effectText = (c: AugmentCategory, lv: number): string | null => {
    if (c === 'attack') return `攻击 +${fx.attack[lv - 1] ?? 0}`;
    if (c === 'affinity') return `会心 +${fx.affinity[lv - 1] ?? 0}%`;
    if (c === 'defense') return `防御 +${fx.defense[lv - 1] ?? 0}`;
    if (c === 'slot') return `追加 ${lv} 级镶嵌槽`;
    if (c === 'element') return `属性 +${fx.element[lv - 1] ?? 0}（真实值，未计入）`;
    if (c === 'health') return `回复能力 ${ROMAN[lv]}`;
    return null;
  };
  const shown = PANEL_ORDER.filter((c) => levels.some((a) => a.category === c));
  // 格子栏：按面板顺序把各项占用的格数依次填进去
  const fill = shown.flatMap((c) => Array<AugmentCategory>(chosen.get(c)?.slotCost ?? 0).fill(c));
  const extendOpts = levels.filter((a) => a.category === 'extend').sort((a, b) => a.level - b.level);

  return (
    <>
      <div className="gb-hexrow">
        <AugmentBar fill={fill} capacity={capacity} full={full} focus={focus} />
        <small>{`基础 ${base} + 扩充 ${extend}`}</small>
      </div>
      <ul className="gb-aug">
        {shown.map((c) => {
          const opts = levels.filter((a) => a.category === c).sort((a, b) => a.level - b.level);
          const cur = chosen.get(c);
          const free = capacity - used + (cur?.slotCost ?? 0);
          const fxText = (lv: number) => effectText(c, lv);
          return (
            <li
              key={c}
              data-on={cur ? '' : undefined}
              style={{ ['--hex' as string]: AUGMENT_COLORS[c] }}
              onPointerEnter={() => setFocus(c)}
              onPointerLeave={() => setFocus(null)}
              onFocus={() => setFocus(c)}
              onBlur={() => setFocus(null)}
            >
              <GameIcon src={iconUrl.augment(c)} size={30} />
              <span className="gb-aug__label">
                <span className="gb-aug__name">
                  {AUGMENT_NAMES[c]}
                  {cur && <b className="gb-aug__lv">Lv{cur.level}</b>}
                </span>
                {cur ? (
                  <span className="gb-aug__fx">
                    {fxText(cur.level)}
                    <small>占 {cur.slotCost} 格</small>
                  </span>
                ) : (
                  <span className="gb-aug__fx gb-aug__fx--off">未设定</span>
                )}
              </span>
              <LevelStepper
                name={AUGMENT_NAMES[c]}
                current={cur?.level ?? 0}
                levels={opts.map((a) => ({
                  level: a.level,
                  title: [`${a.name}：占 ${a.slotCost} 格`, fxText(a.level)].filter(Boolean).join(' · '),
                }))}
                blocked={(lv) => {
                  const a = opts.find((o) => o.level === lv);
                  if (!a) return null;
                  return a.slotCost > free ? `格数不足：${a.name}需 ${a.slotCost} 格，可用 ${free} 格` : null;
                }}
                onSet={(lv) => onAugment(c, lv)}
              />
            </li>
          );
        })}
        {/* 扩充自定义栏：本身不占格，只把上限往上抬 */}
        {extendOpts.length > 0 && (
          <li className="gb-aug--extend" data-on={extend ? '' : undefined}>
            <GameIcon src={iconUrl.augment('slot')} size={30} />
            <span className="gb-aug__label">
              <span className="gb-aug__name">
                {AUGMENT_NAMES.extend}
                {extend > 0 && <b className="gb-aug__lv">Lv{extend}</b>}
              </span>
              <span className="gb-aug__fx gb-aug__fx--off">
                {extend ? `上限 ${base} → ${base + extend} 格` : `最多扩充到 ${full} 格`}
              </span>
            </span>
            <LevelStepper
              name={AUGMENT_NAMES.extend}
              current={extend}
              levels={extendOpts.map((a) => ({ level: a.level, title: `${a.name}：上限 +${a.level} 格` }))}
              blocked={() => null}
              onSet={(lv) => onAugment('extend', lv)}
            />
          </li>
        )}
      </ul>
      <p className="gb-note">
        攻击 / 会心 / 防御的加值取自游戏数据（pl_param），已计入状态；属性强化的换算待确认，未计入。
        未扩充与每级扩充的格数为推断（稀有度 10 / 11 / 12 最大 9 / 8 / 6）。
      </p>
    </>
  );
}

function PartsPanel({
  build,
  idx,
  onCustom,
}: {
  build: Build;
  idx: Index;
  onCustom: (fn: (c: WeaponCustom) => WeaponCustom) => void;
}) {
  const parts = [...idx.parts.values()];
  if (!parts.length) return null;
  const totals = partTotals(chosenParts(build, idx));
  const setStage = (i: number, id: number | null) =>
    onCustom((c) => {
      const next = [...c.parts];
      while (next.length <= i) next.push(null);
      next[i] = id;
      return { ...c, parts: next };
    });

  return (
    <>
      <ol className="gb-parts">
        {Array.from({ length: PART_STAGES }, (_, i) => {
          const opts = parts.filter((p) => p.stage === i + 1);
          const cur = build.custom.parts[i] ?? null;
          return (
            <li key={i}>
              <span className="gb-parts__row">
                <span className="gb-parts__stage" id={`gb-part-${i}`}>
                  阶段 {i + 1}
                </span>
                <Dropdown<number | null>
                  labelledBy={`gb-part-${i}`}
                  value={cur}
                  options={[
                    { value: null, label: '—', text: '无' },
                    ...opts.map((p) => ({ value: p.id, label: p.name, hint: partEffectText(p.effect) })),
                  ]}
                  onChange={(v) => setStage(i, v)}
                />
              </span>
            </li>
          );
        })}
      </ol>
      <p className="gb-note">
        {Object.keys(totals).length ? `合计：${partEffectText(totals)}。` : ''}
        攻击为真实值加值（已核对）；会心、属性、防御按武器数据的单位计入（推断）；锐利度的单位未确认，未计入。
      </p>
    </>
  );
}

function AwakeningPanel({
  build,
  idx,
  onPick,
  onCustom,
}: {
  build: Build;
  idx: Index;
  onPick: (slot: number) => void;
  onCustom: (fn: (c: WeaponCustom) => WeaponCustom) => void;
}) {
  const chosen = chosenAwakening(build, idx);
  const clear = (i: number) =>
    onCustom((c) => {
      const next = [...c.awakening];
      next[i] = null;
      return { ...c, awakening: next };
    });
  const total = (kind: 'attack' | 'affinity' | 'defense') => awakeningTotal(build, idx, kind);

  return (
    <section className="gb-custom" aria-label="觉醒能力">
      <CustomHead
        title="觉醒能力"
        extra={
          <span className="gb-custom__cost">
            已设定 {chosen.filter(Boolean).length} / {chosen.length} 栏
          </span>
        }
      />
      <ol className="gb-awk">
        {chosen.map((a, i) => (
          <li key={i} data-empty={a ? undefined : ''}>
            <button
              type="button"
              className="gb-awk__slot"
              aria-label={`觉醒栏 ${i + 1}：${a?.name ?? '空'}，点击更换`}
              onClick={() => onPick(i)}
            >
              <span className="gb-awk__rank" data-rank={a?.rank ?? 0}>
                {a ? ROMAN[a.rank] : i + 1}
              </span>
              <span className="gb-awk__name">{a?.name ?? '未设定'}</span>
              {a && (
                <span className="gb-awk__group">
                  {awakeningEffectText(a) ?? AWAKENING_GROUPS[a.category] ?? '武器专属'}
                </span>
              )}
            </button>
            {a && (
              <button type="button" className="gb-btn gb-btn--ghost gb-awk__clear" onClick={() => clear(i)}>
                卸下
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="gb-note">
        合计：攻击 +{total('attack')}、会心 +{total('affinity')}%、防御 +{total('defense')}。 数值取自
        em104lbr：攻击、会心、防御、属性 / 状态异常已计入状态，镶嵌槽强化会追加一个槽； 系列技能按 1
        件计入；锐利度未计入。栏数与搭配规则待确认。
      </p>
    </section>
  );
}

/** 觉醒能力选择器的条目说明 */
export const awakeningMeta = (a: AwakeningData) =>
  [
    AWAKENING_GROUPS[a.category] ?? '武器专属',
    `等级 ${ROMAN[a.rank]}`,
    awakeningEffectText(a),
    a.stackable ? null : '不可重复',
  ]
    .filter(Boolean)
    .join(' · ');

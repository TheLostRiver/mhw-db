/**
 * 武器客制面板：大师自定义强化（每种选一个等级 + 扩充自定义栏）、零件强化（每阶段一个零件）、冥赤龙觉醒能力（5 栏）、
 * 上位自定义强化（每格选一种，同种可重复）。面板按「自定义强化 / 零件强化」分区切换，容量用游戏里的六角格表示。
 * 规则与数值的确认状态见 docs/DATA.md 3.3；未确认的部分只显示、不计入状态。
 */
import { useState } from 'react';
import {
  EXTEND_LEVELS,
  HR_AUGMENTS,
  HR_AUGMENT_SLOTS,
  PART_STAGES,
  augmentBase,
  augmentCapacity,
  augmentCost,
  augmentLevels,
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
      <h3 className="gb-h gb-h--sub">武器客制</h3>
      <p className="gb-note">这把武器没有自定义强化（上位为稀有度 6–8，大师为稀有度 10–12）。</p>
    </section>
  );
}

/** 分区切换的按钮组（游戏里也是几个页签来回切） */
function SectionTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="gb-custom__tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          className="gb-chip"
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 栏位占用的六角格：实心的为已占用，空心的为剩余格数 */
function HexTrack({ used, total }: { used: number; total: number }) {
  return (
    <span className="gb-hex" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <img
          key={i}
          src={iconUrl.augmentHex(i < used)}
          width={14}
          height={16}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ))}
    </span>
  );
}

/** 大师自定义强化 + 零件强化：两者都只有大师武器有，用分区切换 */
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
  const hasParts = idx.parts.size > 0;
  return (
    <>
      {hasParts && (
        <SectionTabs
          tabs={[
            { key: 'augment' as const, label: '自定义强化' },
            { key: 'parts' as const, label: '零件强化' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {tab === 'augment' || !hasParts ? (
        <AugmentPanel weapon={weapon} build={build} idx={idx} onAugment={onAugment} />
      ) : (
        <PartsPanel build={build} idx={idx} onCustom={onCustom} />
      )}
    </>
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
      <h3 className="gb-h gb-h--sub">
        自定义强化
        <span className="gb-custom__cost" title="上位格数按稀有度 6 / 7 / 8 = 3 / 2 / 1，待确认">
          {slots} 格
        </span>
      </h3>
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
  const chosen = augmentLevels(build, idx);
  const extend = extendLevel(build, idx);
  const capacity = augmentCapacity(weapon, extend);
  const base = augmentBase(weapon);
  // 六角格按「全部扩充后」的总数画，没开出来的格子一眼能看出来
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
    return null;
  };
  const extendOpts = levels.filter((a) => a.category === 'extend').sort((a, b) => a.level - b.level);

  return (
    <section className="gb-custom" aria-label="自定义强化">
      <h3 className="gb-h gb-h--sub">
        自定义强化
        <span
          className="gb-custom__cost"
          title="上限随扩充自定义栏增加（稀有度 10 / 11 / 12 最大 9 / 8 / 6）"
        >
          占用 <b data-over={used > capacity ? '' : undefined}>{used}</b> / {capacity} 格
        </span>
      </h3>
      <div className="gb-hexrow">
        <HexTrack used={used} total={full} />
        <small>{`基础 ${base} + 扩充 ${extend}`}</small>
      </div>
      <ul className="gb-aug">
        {PANEL_ORDER.filter((c) => levels.some((a) => a.category === c)).map((c) => {
          const opts = levels.filter((a) => a.category === c).sort((a, b) => a.level - b.level);
          const cur = chosen.get(c);
          return (
            <li key={c}>
              <GameIcon src={iconUrl.augment(c)} size={22} />
              <span className="gb-aug__label">
                <span className="gb-aug__name">{AUGMENT_NAMES[c]}</span>
                {cur ? (
                  <span className="gb-aug__fx">
                    {effectText(c, cur.level)}
                    <small>{cur.slotCost} 格</small>
                  </span>
                ) : (
                  <span className="gb-aug__fx gb-aug__fx--off">未设定</span>
                )}
              </span>
              <span className="gb-aug__levels" role="radiogroup" aria-label={AUGMENT_NAMES[c]}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!cur}
                  aria-label="不强化"
                  onClick={() => onAugment(c, 0)}
                >
                  —
                </button>
                {opts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={cur?.id === a.id}
                    aria-label={a.name}
                    // 换成该等级后超出上限的选项不可选
                    disabled={cur?.id !== a.id && used - (cur?.slotCost ?? 0) + a.slotCost > capacity}
                    title={`${a.name}：占用 ${a.slotCost} 格${a.desc ? `\n${a.desc}` : ''}`}
                    onClick={() => onAugment(c, a.level)}
                  >
                    {ROMAN[a.level]}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
        {/* 扩充自定义栏：本身不占格，只把上限往上抬 */}
        {extendOpts.length > 0 && (
          <li className="gb-aug--extend">
            <GameIcon src={iconUrl.augment('slot')} size={22} />
            <span className="gb-aug__label">
              <span className="gb-aug__name">{AUGMENT_NAMES.extend}</span>
              <span className="gb-aug__fx gb-aug__fx--off">
                {extend ? `上限 +${extend} 格` : `上限 ${base} → ${base + EXTEND_LEVELS} 格`}
              </span>
            </span>
            <span className="gb-aug__levels">
              {/* 扩充只影响上限，与占格无关，所以不做超限判断 */}
              <button type="button" aria-label="不扩充" onClick={() => onAugment('extend', 0)}>
                —
              </button>
              {extendOpts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-label={a.name}
                  title={`${a.name}：上限 +${a.level} 格`}
                  onClick={() => onAugment('extend', a.level)}
                >
                  {ROMAN[a.level]}
                </button>
              ))}
            </span>
          </li>
        )}
      </ul>
      <p className="gb-note">
        攻击 / 会心 / 防御的加值取自游戏数据（pl_param），已计入状态；属性强化的换算待确认，未计入。
        未扩充与每级扩充的格数为推断（稀有度 10 / 11 / 12 最大 9 / 8 / 6）。
      </p>
    </section>
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
    <section className="gb-custom" aria-label="零件强化">
      <h3 className="gb-h gb-h--sub">
        零件强化
        <span className="gb-custom__cost">{PART_STAGES} 阶段</span>
      </h3>
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
        零件数值是加值还是等级尚未与游戏核对，暂不计入状态。
      </p>
    </section>
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
      <h3 className="gb-h gb-h--sub">
        觉醒能力
        <span className="gb-custom__cost">
          已设定 {chosen.filter(Boolean).length} / {chosen.length} 栏
        </span>
      </h3>
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

/**
 * 武器客制面板：大师自定义强化（每种选一个等级）、零件强化（每阶段选一个零件）、冥赤龙觉醒能力（5 栏）。
 * 规则与数值的确认状态见 docs/DATA.md 3.3；未确认的部分只显示、不计入状态。
 */
import {
  AUGMENT_ORDER,
  PART_STAGES,
  augmentCost,
  augmentLevels,
  chosenAwakening,
  chosenParts,
  customKind,
  partTotals,
  type AugmentCategory,
  type AwakeningData,
  type Build,
  type Index,
  type PartEffectKey,
  type WeaponCustom,
  type WeaponData,
} from '../../lib/world/builder';

export const AUGMENT_NAMES: Record<AugmentCategory, string> = {
  attack: '攻击力强化',
  affinity: '会心率强化',
  defense: '防御力强化',
  slot: '镶嵌槽强化',
  health: '赋予回复能力',
  element: '属性·状态异常强化',
  extend: '扩充自定义栏',
};

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
      <>
        <AugmentPanel build={build} idx={idx} onAugment={onAugment} />
        <PartsPanel build={build} idx={idx} onCustom={onCustom} />
      </>
    );
  return (
    <section className="gb-custom" aria-label="武器客制">
      <h3 className="gb-h gb-h--sub">武器客制</h3>
      <p className="gb-note">大师自定义强化从稀有度 10 开始；上位（稀有度 6–8）的自定义强化尚未接入。</p>
    </section>
  );
}

function AugmentPanel({
  build,
  idx,
  onAugment,
}: {
  build: Build;
  idx: Index;
  onAugment: (c: AugmentCategory, level: number) => void;
}) {
  const chosen = augmentLevels(build, idx);
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

  return (
    <section className="gb-custom" aria-label="自定义强化">
      <h3 className="gb-h gb-h--sub">
        自定义强化
        <span className="gb-custom__cost" title="自定义强化栏位上限待确认">
          占用 <b>{augmentCost(build, idx)}</b> 格
        </span>
      </h3>
      <ul className="gb-aug">
        {AUGMENT_ORDER.map((c) => {
          const opts = levels.filter((a) => a.category === c).sort((a, b) => a.level - b.level);
          const cur = chosen.get(c);
          return (
            <li key={c}>
              <span className="gb-aug__label">
                <span className="gb-aug__name">{AUGMENT_NAMES[c]}</span>
                {cur && (
                  <span className="gb-aug__fx">
                    {effectText(c, cur.level)}
                    <small>{cur.slotCost} 格</small>
                  </span>
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
      </ul>
      <p className="gb-note">
        攻击 / 会心 /
        防御的加值取自游戏数据（pl_param），已计入状态；各稀有度的栏位上限、属性强化的换算待确认。
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
      <h3 className="gb-h gb-h--sub">零件强化</h3>
      <ol className="gb-parts">
        {Array.from({ length: PART_STAGES }, (_, i) => {
          const opts = parts.filter((p) => p.stage === i + 1);
          const cur = build.custom.parts[i] ?? null;
          return (
            <li key={i}>
              <label>
                <span className="gb-parts__stage">阶段 {i + 1}</span>
                <select
                  value={cur ?? ''}
                  onChange={(e) => setStage(i, e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">—</option>
                  {opts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{partEffectText(p.effect)}）
                    </option>
                  ))}
                </select>
              </label>
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

  return (
    <section className="gb-custom" aria-label="觉醒能力">
      <h3 className="gb-h gb-h--sub">觉醒能力</h3>
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
        数值取自 em104lbr：攻击、会心、防御、属性 / 状态异常已计入状态，镶嵌槽强化会追加一个槽； 系列技能按 1
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

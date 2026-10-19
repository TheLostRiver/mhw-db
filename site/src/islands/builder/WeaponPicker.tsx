/**
 * 武器选择器：卡片网格（一行多把）。每张卡片列出稀有度、镶嵌槽、攻击力（显示值与真实值）、属性 / 隐藏属性、
 * 龙封力、会心、防御加成、锐利度（含匠的延长段）、武器技能、专属参数与可用的客制；装备着武器时标出与它的差值。
 * 筛选：全部 / 大师 / 上位 / 下位 / 冥赤龙 / 绚辉龙，属性，零件强化等特性；排序可切换升降序，选择会记在本机。
 * 键盘：方向键在卡片间移动，回车选择，Esc 关闭；手机上为底部抽屉。
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  SHARPNESS_COLORS,
  customKind,
  sharpnessBar,
  type Index,
  type WeaponData,
} from '../../lib/world/builder';
import { ELDERSEAL, ELEMENT_NAMES, weaponSpecialText } from '../../lib/world/encyclopedia';
import { NOTE_LABEL } from '../../lib/world/horn';
import Dropdown from './Dropdown';
import { GameIcon, iconUrl } from './icons';
import './weapon-picker.css';

/** 属性 / 状态异常的图标（cmn_status00 的格子，与猎虫页一致） */
const ELEMENT_ICON: Record<string, number> = {
  fire: 3,
  water: 4,
  thunder: 5,
  ice: 6,
  dragon: 7,
  poison: 8,
  paralysis: 10,
  sleep: 12,
  blast: 13,
};
const ELEMENT_ORDER = ['fire', 'water', 'thunder', 'ice', 'dragon', 'poison', 'paralysis', 'sleep', 'blast'];
/** 状态图标：攻击、会心、防御、龙封力（龙头与剑，按图形挑选） */
const ICON = { attack: 25, affinity: 27, defense: 26, elderseal: 76 };

type GroupKey = 'all' | 'mr' | 'hr' | 'lr' | 'awakened' | 'kulve';
const GROUPS: { key: GroupKey; label: string; title: string; test: (w: WeaponData) => boolean }[] = [
  { key: 'all', label: '全部', title: '全部武器', test: () => true },
  { key: 'mr', label: '大师', title: '大师等级（稀有度 9–12）', test: (w) => w.rarity >= 9 },
  { key: 'hr', label: '上位', title: '上位（稀有度 5–8）', test: (w) => w.rarity >= 5 && w.rarity <= 8 },
  { key: 'lr', label: '下位', title: '下位（稀有度 1–4）', test: (w) => w.rarity <= 4 },
  { key: 'awakened', label: '冥赤龙', title: '冥赤龙武器（觉醒能力）', test: (w) => w.awakened === true },
  {
    key: 'kulve',
    label: '绚辉龙',
    title: '绚辉龙武器（金色 / 铠罗炎 / 皇金）',
    test: (w) => w.kulve === true,
  },
];

type TraitKey = 'final' | 'parts' | 'skill' | 'slot4';
const TRAITS: { key: TraitKey; label: string; title: string; test: (w: WeaponData) => boolean }[] = [
  {
    key: 'final',
    label: '衍生上限',
    title: '只看强化到头的武器（游戏里只有这些能自定义强化）',
    test: (w) => !w.canUpgrade,
  },
  {
    key: 'parts',
    label: '可零件强化',
    title: '支援零件强化（拼装外形的大师武器）',
    test: (w) => w.customParts === true && !w.canUpgrade,
  },
  { key: 'skill', label: '武器技能', title: '自带技能的武器', test: (w) => w.skill != null },
  { key: 'slot4', label: '4 级槽', title: '有 4 级镶嵌槽', test: (w) => w.slots.includes(4) },
];

type SortKey =
  'default' | 'attack' | 'efr' | 'affinity' | 'element' | 'sharp' | 'slots' | 'defense' | 'rarity';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'attack', label: '攻击力' },
  { key: 'efr', label: '期望攻击力' },
  { key: 'affinity', label: '会心率' },
  { key: 'element', label: '属性 / 状态异常值' },
  { key: 'sharp', label: '锐利度（白 + 紫）' },
  { key: 'slots', label: '镶嵌槽' },
  { key: 'defense', label: '防御力加成' },
  { key: 'rarity', label: '稀有度' },
  { key: 'default', label: '游戏内顺序' },
];

const STORE_KEY = 'mhdb-weapon-picker-v1';
interface Saved {
  group: GroupKey;
  element: string;
  traits: TraitKey[];
  sort: SortKey;
  desc: boolean;
}
const loadSaved = (): Partial<Saved> => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
};

/** 镶嵌槽排序用的分数：先比最高等级，再比个数（4·4 > 4·1 > 3·3·3） */
const slotScore = (slots: number[]) =>
  [...slots].sort((a, b) => b - a).reduce((n, s, i) => n + s * 10 ** (4 - i * 2), 0);

/** 武器的全部属性（双属性双剑有两个；隐藏属性单独标出） */
const elementsOf = (w: WeaponData) =>
  w.special?.elements ?? (w.element ? [w.element] : w.hiddenElement ? [w.hiddenElement] : []);

interface Props {
  title: string;
  weaponType: string;
  weapons: WeaponData[];
  idx: Index;
  current: number | null;
  onPick: (id: number | null) => void;
  onClose: () => void;
}

export default function WeaponPicker({ title, weaponType, weapons, idx, current, onPick, onClose }: Props) {
  const [saved] = useState(loadSaved);
  const cur = current == null ? undefined : idx.weapons.get(current);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<GroupKey>(() => {
    // 装备着武器时默认显示它所在的等级段，没装备时默认大师
    if (cur) return cur.awakened ? 'awakened' : cur.rarity >= 9 ? 'mr' : cur.rarity >= 5 ? 'hr' : 'lr';
    return saved.group ?? 'mr';
  });
  const [element, setElement] = useState(saved.element ?? 'all');
  const [traits, setTraits] = useState<TraitKey[]>(saved.traits ?? []);
  const [sort, setSort] = useState<SortKey>(saved.sort ?? 'attack');
  const [desc, setDesc] = useState(saved.desc ?? true);
  // −1 表示还没动过：选中项落在当前武器上（打开时把它滚进视野）
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const bloat = idx.bloat[weaponType] ?? 1;

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ group, element, traits, sort, desc } satisfies Saved));
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [group, element, traits, sort, desc]);

  /** 期望攻击力（真实值）：攻击 ×（1 + 会心期望）× 当前最高色的锐利度倍率，与配装状态同一公式 */
  const efr = useMemo(() => {
    const out = new Map<number, number>();
    for (const w of weapons) {
      const bar = w.sharpness && w.handicraft != null ? sharpnessBar(w.sharpness, w.handicraft, 0) : null;
      const sharp = bar ? (idx.sharpnessMultiplier.raw[bar.top] ?? 1) : 1;
      const a = w.affinity / 100;
      const crit = a >= 0 ? 1 + a * (idx.crit.good - 1) : 1 - a * (idx.crit.bad - 1);
      out.set(w.id, w.attack * crit * sharp);
    }
    return out;
  }, [weapons, idx]);

  const sortValue = (w: WeaponData): number => {
    switch (sort) {
      case 'attack':
        return w.attack;
      case 'efr':
        return efr.get(w.id) ?? 0;
      case 'affinity':
        return w.affinity;
      case 'element':
        return Math.max(0, ...elementsOf(w).map((e) => e.value));
      case 'sharp': {
        const s = w.sharpness;
        if (!s || w.handicraft == null) return 0;
        const bar = sharpnessBar(s, w.handicraft, 0);
        return (bar.segments[5] ?? 0) * 10 + (bar.segments[6] ?? 0) * 100;
      }
      case 'slots':
        return slotScore(w.slots);
      case 'defense':
        return w.defense;
      case 'rarity':
        return w.rarity;
      default:
        return 0;
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const g = GROUPS.find((x) => x.key === group) ?? GROUPS[0]!;
    const out = weapons.filter((w) => {
      if (!g.test(w)) return false;
      if (element === 'none' && elementsOf(w).length) return false;
      if (element !== 'all' && element !== 'none' && !elementsOf(w).some((e) => e.type === element))
        return false;
      for (const t of traits) if (!TRAITS.find((x) => x.key === t)!.test(w)) return false;
      if (!q) return true;
      const text = [
        w.name,
        ...elementsOf(w).map((e) => ELEMENT_NAMES[e.type] ?? ''),
        w.skill != null ? (idx.skills.get(w.skill)?.name ?? '') : '',
        weaponSpecialText(w.special),
      ]
        .join(' ')
        .toLowerCase();
      return text.includes(q);
    });
    if (sort === 'default') return desc ? out : [...out].reverse();
    const dir = desc ? -1 : 1;
    return out
      .map((w, i) => ({ w, i, v: sortValue(w) }))
      .sort((a, b) => (a.v === b.v ? a.i - b.i : (a.v - b.v) * dir))
      .map((x) => x.w);
    // sortValue 只依赖 sort 与 efr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weapons, query, group, element, traits, sort, desc, efr, idx]);

  const [picked, setActive] = useState(-1);
  const active =
    picked >= 0
      ? picked
      : Math.max(
          0,
          filtered.findIndex((w) => w.id === current),
        );

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const columns = () =>
    list.current
      ? getComputedStyle(list.current).gridTemplateColumns.split(' ').filter(Boolean).length || 1
      : 1;
  const move = (d: number) => setActive(Math.max(0, Math.min(filtered.length - 1, active + d)));
  const reset = () => setActive(0);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (e.target instanceof HTMLElement && e.target.closest('[role="combobox"]')) return;
    const typing = e.target === input.current;
    if (e.key === 'ArrowDown') move(columns());
    else if (e.key === 'ArrowUp') move(-columns());
    else if (e.key === 'ArrowRight' && !typing) move(1);
    else if (e.key === 'ArrowLeft' && !typing) move(-1);
    else if (e.key === 'Enter') {
      const w = filtered[active];
      if (w) onPick(w.id);
      return;
    } else return;
    e.preventDefault();
  };

  const toggleTrait = (t: TraitKey) => {
    setTraits((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
    reset();
  };
  const presentElements = useMemo(
    () => ELEMENT_ORDER.filter((t) => weapons.some((w) => elementsOf(w).some((e) => e.type === t))),
    [weapons],
  );

  return (
    <div
      className="gb-picker"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="gb-picker__card gb-wp"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKey}
      >
        <header className="gb-picker__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="gb-btn gb-btn--ghost" onClick={() => onPick(null)}>
            卸下
          </button>
          <button type="button" className="gb-btn gb-btn--ghost" onClick={onClose} aria-label="关闭">
            Esc
          </button>
        </header>
        <label className="gb-picker__search">
          <span className="visually-hidden">搜索武器</span>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="武器名、属性、技能或瓶，如 灭龙瓶"
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
          />
          <span className="gb-picker__count">{filtered.length}</span>
        </label>

        <div className="gb-wp__tools">
          <div className="gb-wp__groups" role="radiogroup" aria-label="类别">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                role="radio"
                aria-checked={group === g.key}
                title={g.title}
                className="gb-wp__group"
                data-kind={g.key}
                onClick={() => {
                  setGroup(g.key);
                  reset();
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="gb-wp__row">
            <div className="gb-picker__tabs" role="radiogroup" aria-label="属性">
              <button
                type="button"
                role="radio"
                aria-checked={element === 'all'}
                className="gb-chip"
                onClick={() => {
                  setElement('all');
                  reset();
                }}
              >
                全部属性
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={element === 'none'}
                className="gb-chip"
                onClick={() => {
                  setElement('none');
                  reset();
                }}
              >
                无属性
              </button>
              {presentElements.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={element === t}
                  aria-label={ELEMENT_NAMES[t]}
                  title={ELEMENT_NAMES[t]}
                  className="gb-chip gb-wp__el"
                  onClick={() => {
                    setElement(t);
                    reset();
                  }}
                >
                  <GameIcon src={iconUrl.status(ELEMENT_ICON[t]!)} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div className="gb-wp__row">
            <div className="gb-picker__tabs" role="group" aria-label="特性">
              {TRAITS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="gb-chip"
                  aria-pressed={traits.includes(t.key)}
                  title={t.title}
                  onClick={() => toggleTrait(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="gb-picker__sort">
              <span aria-hidden="true">排序</span>
              <Dropdown
                label="排序方式"
                value={sort}
                options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
                onChange={(v) => {
                  setSort(v);
                  reset();
                }}
              />
              <button
                type="button"
                className="gb-chip"
                aria-label={desc ? '降序，点击切换为升序' : '升序，点击切换为降序'}
                onClick={() => setDesc((d) => !d)}
              >
                {desc ? '↓ 降序' : '↑ 升序'}
              </button>
            </div>
          </div>
        </div>

        <ul ref={list} className="gb-wp__grid" role="listbox" aria-labelledby={titleId}>
          {filtered.map((w, i) => (
            <WeaponCard
              key={w.id}
              w={w}
              index={i}
              active={i === active}
              current={w.id === current}
              compare={cur && cur.id !== w.id ? cur : undefined}
              weaponType={weaponType}
              bloat={bloat}
              idx={idx}
              efr={efr.get(w.id) ?? 0}
              onHover={() => i !== active && setActive(i)}
              onPick={() => onPick(w.id)}
            />
          ))}
          {filtered.length === 0 && <li className="gb-picker__empty">没有符合条件的武器</li>}
        </ul>
      </div>
    </div>
  );
}

/** 与当前武器的差值：正数绿色、负数红色，相等不显示 */
function Delta({ d, unit = '' }: { d: number; unit?: string }) {
  if (!d) return null;
  return (
    <small className="gb-wp__delta" data-sign={d > 0 ? 'up' : 'down'}>
      {d > 0 ? '▲' : '▼'}
      {Math.abs(d)}
      {unit}
    </small>
  );
}

function WeaponCard({
  w,
  index,
  active,
  current,
  compare,
  weaponType,
  bloat,
  idx,
  efr,
  onHover,
  onPick,
}: {
  w: WeaponData;
  index: number;
  active: boolean;
  current: boolean;
  compare: WeaponData | undefined;
  weaponType: string;
  bloat: number;
  idx: Index;
  efr: number;
  onHover: () => void;
  onPick: () => void;
}) {
  const shown = (n: number) => Math.round(n * bloat);
  const els = w.special?.elements ?? (w.element ? [w.element] : []);
  const hidden = !w.special?.elements && !w.element ? w.hiddenElement : null;
  const special = weaponSpecialText(w.special);
  const kind = customKind(w);
  const skill = w.skill != null ? idx.skills.get(w.skill) : undefined;
  // 属性差值只在两把武器属性相同时比较（龙 180 与雷 480 比数值没有意义）
  const firstElement = (x: WeaponData) => x.special?.elements?.[0] ?? x.element ?? x.hiddenElement;
  const mine = firstElement(w);
  const theirs = compare ? firstElement(compare) : null;
  const elementDelta = mine && theirs && mine.type === theirs.type ? (mine.value - theirs.value) * 10 : 0;
  return (
    <li
      role="option"
      aria-selected={active}
      data-index={index}
      data-current={current ? '' : undefined}
      className="gb-wcard"
      style={{ ['--rar' as string]: `var(--gb-rarity-${w.rarity})` }}
      onPointerMove={(e) => e.pointerType === 'mouse' && onHover()}
      onClick={onPick}
    >
      <div className="gb-wcard__side">
        <span className="gb-wcard__icon">
          <GameIcon src={iconUrl.weapon(weaponType, w.rarity)} size={40} />
        </span>
        <b className="gb-wcard__rare">RARE {w.rarity}</b>
        <span className="gb-wcard__slots" aria-label={`镶嵌槽：${w.slots.join('、') || '无'}`}>
          {[0, 1, 2].map((k) =>
            w.slots[k] ? (
              <GameIcon key={k} src={iconUrl.socket(w.slots[k]!)} size={16} />
            ) : (
              <i key={k} aria-hidden="true" />
            ),
          )}
        </span>
      </div>

      <div className="gb-wcard__main">
        <div className="gb-wcard__head">
          <span className="gb-wcard__name">{w.name}</span>
          <span className="gb-wcard__tags">
            {current && <em data-tag="current">已装备</em>}
            {w.awakened && <em data-tag="awakened">冥赤龙</em>}
            {w.kulve && <em data-tag="kulve">绚辉龙</em>}
            {kind === 'augment' && w.customParts && <em title="支援零件强化">零件</em>}
            {w.canUpgrade && (
              <em data-tag="more" title="还能继续强化；强化到衍生上限后才能自定义强化">
                未到上限
              </em>
            )}
          </span>
        </div>

        <dl className="gb-wcard__stats">
          <div
            title={`攻击力：显示值 ${shown(w.attack)}，真实值 ${w.attack}；期望攻击力（真实值）${Math.round(efr)}`}
          >
            <dt>
              <GameIcon src={iconUrl.status(ICON.attack)} size={18} alt="攻击力" />
            </dt>
            <dd>
              <b>{shown(w.attack)}</b>
              {bloat !== 1 && <small>({w.attack})</small>}
              {compare && <Delta d={shown(w.attack) - shown(compare.attack)} />}
            </dd>
          </div>
          <div title={hidden ? '隐藏属性：需要「解放属性 / 状态异常」才能发挥' : '属性 / 状态异常'}>
            <dt>
              {els.length || hidden ? (
                <span className="gb-wcard__els">
                  {(els.length ? els : [hidden!]).map((e) => (
                    <GameIcon
                      key={e.type}
                      src={iconUrl.status(ELEMENT_ICON[e.type] ?? 3)}
                      size={18}
                      alt={ELEMENT_NAMES[e.type] ?? ''}
                    />
                  ))}
                </span>
              ) : (
                <GameIcon src={iconUrl.status(3)} size={18} className="gb-wcard__off" alt="属性" />
              )}
            </dt>
            <dd data-hidden={hidden ? '' : undefined}>
              {els.length ? (
                els.map((e, k) => (
                  <Fragment key={e.type}>
                    {k > 0 && <span className="gb-wcard__sep">/</span>}
                    <b>{e.value * 10}</b>
                  </Fragment>
                ))
              ) : hidden ? (
                <b>({hidden.value * 10})</b>
              ) : (
                <span className="gb-wcard__none">—</span>
              )}
              {elementDelta !== 0 && <Delta d={elementDelta} />}
            </dd>
          </div>
          <div title="龙封力">
            <dt>
              <GameIcon src={iconUrl.status(ICON.elderseal)} size={18} alt="龙封力" />
            </dt>
            <dd>
              {w.elderseal ? <b>{ELDERSEAL[w.elderseal]}</b> : <span className="gb-wcard__none">—</span>}
            </dd>
          </div>
          <div title="会心率">
            <dt>
              <GameIcon src={iconUrl.status(ICON.affinity)} size={18} alt="会心率" />
            </dt>
            <dd data-neg={w.affinity < 0 ? '' : undefined}>
              <b>{w.affinity}%</b>
              {compare && <Delta d={w.affinity - compare.affinity} unit="%" />}
            </dd>
          </div>
          <div title="防御力加成">
            <dt>
              <GameIcon src={iconUrl.status(ICON.defense)} size={18} alt="防御力加成" />
            </dt>
            <dd>{w.defense ? <b>+{w.defense}</b> : <span className="gb-wcard__none">0</span>}</dd>
          </div>
          {(special || w.special?.notes) && (
            <div className="gb-wcard__special" title="专属参数">
              <dd>
                {w.special?.notes ? (
                  <span
                    className="s-hns"
                    role="img"
                    aria-label={w.special.notes.map((n) => NOTE_LABEL[n]).join('')}
                  >
                    {w.special.notes.map((n, k) => (
                      <i key={k} className={`s-hn s-hn--${n}`} title={NOTE_LABEL[n]} />
                    ))}
                  </span>
                ) : (
                  special
                )}
              </dd>
            </div>
          )}
        </dl>

        {w.sharpness && w.handicraft != null && <SharpGauge ends={w.sharpness} handicraft={w.handicraft} />}
        {skill && (
          <p className="gb-wcard__skill">
            <GameIcon src={iconUrl.skill(skill.iconColor)} size={16} />
            {skill.name}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * 锐利度条：左端画成剑柄（自绘），实色为不带匠的长度，其后的淡色为匠 5 时能延长的部分；
 * 提示里写出白 / 紫的长度（游戏单位，满条 400）。
 */
function SharpGauge({ ends, handicraft }: { ends: number[]; handicraft: number }) {
  const FULL = 400;
  const now = sharpnessBar(ends, handicraft, 0);
  const max = sharpnessBar(ends, handicraft, 5);
  const label = (b: typeof now) =>
    SHARPNESS_COLORS.map((c, i) => [c, b.segments[i] ?? 0] as const)
      .filter(([, n]) => n > 0)
      .slice(-2)
      .map(([c, n]) => `${SHARP_NAMES[c]} ${n}`)
      .join(' · ');
  return (
    <span className="gb-wcard__sharp" title={`锐利度：${label(now)}；匠 5：${label(max)}`}>
      <i className="gb-wcard__hilt" aria-hidden="true" />
      <span className="gb-wcard__blade">
        {SHARPNESS_COLORS.map((c, i) => {
          const a = now.segments[i] ?? 0;
          const extra = (max.segments[i] ?? 0) - a;
          return (
            <Fragment key={c}>
              {a > 0 && <i style={{ width: `${(a / FULL) * 100}%`, background: `var(--sharp-${c})` }} />}
              {extra > 0 && (
                <i
                  data-extra=""
                  style={{ width: `${(extra / FULL) * 100}%`, background: `var(--sharp-${c})` }}
                />
              )}
            </Fragment>
          );
        })}
      </span>
    </span>
  );
}

const SHARP_NAMES: Record<(typeof SHARPNESS_COLORS)[number], string> = {
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
  white: '白',
  purple: '紫',
};

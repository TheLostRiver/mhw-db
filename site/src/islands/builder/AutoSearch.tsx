/**
 * 自动配装：选武器（可直接在这里选、设定客制）或只指定镶嵌槽，选技能（含套装技能）与排除项，
 * 在后台线程里搜索所有能凑出这些技能的配装，
 * 结果以游戏式的方案卡片列出，点「应用此方案」写回手动配装。
 * 搜索算法见 lib/world/search.ts；条件保存在本机浏览器。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ARMOR_SLOTS,
  augmentLevels,
  chosenAwakening,
  chosenParts,
  computeSkills,
  customBonus,
  customKind,
  hrCounts,
  weaponSlots,
  type ArmorSlot,
  type Build,
  type BuilderData,
  type Index,
  type SkillTotal,
  type WeaponData,
} from '../../lib/world/builder';
import { toSearchIndex, type SearchQuery, type SearchResult, type SearchStats } from '../../lib/world/search';
import Dropdown, { type DropdownOption } from './Dropdown';
import Picker, { type PickerItem } from './Picker';
import { GameIcon, iconUrl } from './icons';
import { AUGMENT_NAMES, ROMAN } from './WeaponCustom';
import { ELEMENT_NAMES } from '../../lib/world/encyclopedia';
import type { WorkerRequest, WorkerResponse } from './search.worker';
import './autosearch.css';

const STORAGE_KEY = 'mhdb-autosearch-v0';
const PAGE = 24;

export const SLOT_LABELS: Record<ArmorSlot, string> = {
  head: '头部',
  chest: '身体',
  arms: '腕部',
  waist: '腰部',
  legs: '脚部',
};

export interface SearchConditions {
  skills: { id: number; level: number }[];
  sets: { id: number; level: number }[];
  /** 用手动配装里的当前武器（镶嵌槽含自定义强化，武器技能与觉醒的系列技能也计入） */
  useWeapon: boolean;
  /** 不用当前武器时指定的镶嵌槽（0 表示没有） */
  weaponSlots: [number, number, number];
  minRarity: number;
  limit: number;
  exclude: { armor: number[]; charms: number[]; decos: number[] };
}

const emptyConditions = (): SearchConditions => ({
  skills: [],
  sets: [],
  useWeapon: true,
  weaponSlots: [0, 0, 0],
  minRarity: 0,
  limit: 1000,
  exclude: { armor: [], charms: [], decos: [] },
});

function loadConditions(): SearchConditions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SearchConditions>;
      return { ...emptyConditions(), ...saved, exclude: { ...emptyConditions().exclude, ...saved.exclude } };
    }
  } catch {
    /* 忽略损坏的存档 */
  }
  return emptyConditions();
}

type Picking = 'skill' | 'set' | 'armor' | 'charm' | 'deco' | null;
type SortKey = 'default' | 'defense' | 'free';

const SLOT_OPTIONS: DropdownOption<number>[] = [0, 1, 2, 3, 4].map((n) =>
  n
    ? { value: n, label: `${n} 级`, icon: <GameIcon src={iconUrl.socket(n)} size={18} alt="" /> }
    : { value: 0, label: '—', text: '无' },
);
const RARITY_OPTIONS: DropdownOption<number>[] = [
  { value: 0, label: '不限' },
  ...[5, 9, 10, 11, 12].map((r) => ({
    value: r,
    label: `R${r} 以上`,
    icon: <i className="gb-dd__rar" style={{ ['--rar' as string]: `var(--gb-rarity-${r})` }} />,
  })),
];
const LIMIT_OPTIONS: DropdownOption<number>[] = [200, 1000, 5000].map((n) => ({
  value: n,
  label: `${n} 个方案`,
}));
const SORT_OPTIONS: DropdownOption<SortKey>[] = [
  { value: 'default', label: '推荐（搜索顺序）' },
  { value: 'defense', label: '防御力' },
  { value: 'free', label: '空余镶嵌槽' },
];

/** 只指定镶嵌槽时，用一把虚拟武器（id −1）承载这些槽，好复用 computeSkills */
const VIRTUAL_WEAPON = -1;

interface Props {
  data: BuilderData;
  idx: Index;
  build: Build;
  weaponTypeName: string;
  onApply: (plan: SearchResult) => void;
  /** 打开武器选择器（与手动配装共用） */
  onPickWeapon: () => void;
  onClearWeapon: () => void;
  /** 武器客制面板（自定义强化 / 零件强化 / 觉醒） */
  renderCustom: (w: WeaponData) => ReactNode;
}

const HR_SHORT: Record<string, string> = {
  attack: '攻击',
  affinity: '会心',
  defense: '防御',
  slot: '镶嵌槽',
  health: '回复',
};

/** 客制的一行摘要：攻击力强化 Ⅱ · 镶嵌槽强化 Ⅰ · 零件 3 阶段 */
function customSummaryOf(build: Build, idx: Index): string {
  const out: string[] = [];
  for (const [c, a] of augmentLevels(build, idx))
    if (c !== 'extend') out.push(`${AUGMENT_NAMES[c]} ${ROMAN[a.level]}`);
  const parts = chosenParts(build, idx).length;
  if (parts) out.push(`零件 ${parts} 阶段`);
  for (const [a, n] of hrCounts(build, idx)) out.push(`${HR_SHORT[a] ?? a} ×${n}`);
  for (const a of chosenAwakening(build, idx)) if (a) out.push(a.name);
  return out.join(' · ');
}

export default function AutoSearch({
  data,
  idx,
  build,
  weaponTypeName,
  onApply,
  onPickWeapon,
  onClearWeapon,
  renderCustom,
}: Props) {
  const [cond, setCond] = useState<SearchConditions>(loadConditions);
  const [picking, setPicking] = useState<Picking>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<
    | { state: 'idle' }
    | { state: 'running' }
    | { state: 'done'; ms: number; stats: SearchStats; query: SearchQuery }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [sort, setSort] = useState<SortKey>('default');
  const [shown, setShown] = useState(PAGE);
  const worker = useRef<Worker | null>(null);
  const runId = useRef(0);
  const pendingQuery = useRef<SearchQuery | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cond));
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [cond]);
  useEffect(() => () => worker.current?.terminate(), []);

  const index = useMemo(() => toSearchIndex(data), [data]);
  const weapon = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
  const useWeapon = cond.useWeapon && weapon != null;
  const bonus = customBonus(build, idx);
  const customSummary = customSummaryOf(build, idx);
  // 手动指定的槽：按内容缓存，避免每次渲染都变成新数组
  const slotKey = cond.weaponSlots.join(',');
  const manualSlots = useMemo(
    () =>
      slotKey
        .split(',')
        .map(Number)
        .filter((s) => s > 0),
    [slotKey],
  );
  const slots = useWeapon ? weaponSlots(build, idx) : manualSlots;

  // 能从防具 / 护石 / 饰品得到的技能才列进选择器
  const obtainable = useMemo(() => {
    const s = new Set<number>();
    for (const a of data.armor) for (const k of a.skills) s.add(k.id);
    for (const c of data.charms) for (const k of c.skills) s.add(k.id);
    for (const d of data.decorations) for (const k of d.skills) s.add(k.id);
    return s;
  }, [data]);
  const setSkillIds = useMemo(
    () => new Set(data.armor.flatMap((a) => (a.setSkill ? [a.setSkill.id] : []))),
    [data],
  );

  const update = (fn: (c: SearchConditions) => SearchConditions) => setCond((c) => fn(structuredClone(c)));

  const buildQuery = (): SearchQuery => {
    const fixedSkills: SearchQuery['fixedSkills'] = [];
    const fixedSets: SearchQuery['fixedSets'] = [];
    if (useWeapon && weapon) {
      if (weapon.skill != null) fixedSkills.push({ id: weapon.skill, level: 1 });
      for (const a of chosenAwakening(build, idx))
        if (a?.setSkill != null) fixedSets.push({ id: a.setSkill, points: 1 });
    }
    return {
      skills: cond.skills,
      setSkills: cond.sets,
      weaponSlots: slots,
      maxResults: cond.limit,
      minRarity: cond.minRarity,
      excludeArmor: cond.exclude.armor,
      excludeCharms: cond.exclude.charms,
      excludeDecorations: cond.exclude.decos,
      fixedSkills,
      fixedSets,
    };
  };

  const run = () => {
    // 上一次还没搜完就直接终止线程，开新的
    if (status.state === 'running') {
      worker.current?.terminate();
      worker.current = null;
    }
    if (!worker.current) {
      const w = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', index } satisfies WorkerRequest);
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.id !== runId.current) return;
        if (m.type === 'batch') setResults((r) => r.concat(m.results));
        else if (m.type === 'done')
          setStatus({ state: 'done', ms: m.ms, stats: m.stats, query: pendingQuery.current! });
        else setStatus({ state: 'error', message: m.message });
      };
      worker.current = w;
    }
    const id = ++runId.current;
    const query = buildQuery();
    pendingQuery.current = query;
    setResults([]);
    setShown(PAGE);
    setStatus({ state: 'running' });
    worker.current.postMessage({ type: 'search', id, query } satisfies WorkerRequest);
  };

  const sorted = useMemo(() => {
    if (sort === 'default') return results;
    const score = (r: SearchResult) =>
      sort === 'defense' ? r.defense : r.freeSlots.reduce((n, s) => n + s * s, 0) * 1000 + r.defense;
    return [...results].sort((a, b) => score(b) - score(a));
  }, [results, sort]);

  // 只指定镶嵌槽时的虚拟武器
  const previewIdx = useMemo<Index>(() => {
    if (useWeapon) return idx;
    const virtual: WeaponData = {
      id: VIRTUAL_WEAPON,
      name: '指定镶嵌槽',
      rarity: 0,
      attack: 0,
      affinity: 0,
      defense: 0,
      element: null,
      hiddenElement: null,
      elderseal: 0,
      slots: manualSlots,
      skill: null,
    };
    return { ...idx, weapons: new Map(idx.weapons).set(VIRTUAL_WEAPON, virtual) };
  }, [idx, useWeapon, manualSlots]);

  const toggleExclude = (kind: keyof SearchConditions['exclude'], id: number) =>
    update((c) => {
      const list = c.exclude[kind];
      c.exclude[kind] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return c;
    });

  // ---------- 选择器 ----------
  const pickerProps = (): Omit<React.ComponentProps<typeof Picker>, 'onPick' | 'onClose'> | null => {
    if (picking === 'skill') {
      const chosen = new Set(cond.skills.map((s) => s.id));
      return {
        title: '添加技能',
        current: null,
        layout: 'grid',
        placeholder: '技能名称',
        items: data.skills
          .filter((s) => !s.setBonus && obtainable.has(s.id) && !chosen.has(s.id))
          .map((s): PickerItem => ({
            id: s.id,
            name: s.name,
            search: s.levels.map((l) => l.desc).join(' '),
            icon: <GameIcon src={iconUrl.skill(s.iconColor)} size={30} />,
            meta:
              s.maxLevel > s.baseMaxLevel
                ? `最高 ${s.baseMaxLevel} 级（极意 ${s.maxLevel}）`
                : `最高 ${s.maxLevel} 级`,
          })),
      };
    }
    if (picking === 'set') {
      const chosen = new Set(cond.sets.map((s) => s.id));
      return {
        title: '添加套装技能',
        current: null,
        placeholder: '套装技能名称',
        items: data.skills
          .filter((s) => s.setBonus && setSkillIds.has(s.id) && !chosen.has(s.id))
          .map((s): PickerItem => ({
            id: s.id,
            name: s.name,
            search: s.levels.map((l) => l.desc).join(' '),
            icon: <GameIcon src={iconUrl.skill(s.iconColor)} size={28} />,
            meta: s.levels.map((l) => `${l.level} 件`).join(' · '),
          })),
      };
    }
    if (picking === 'armor') {
      const ex = new Set(cond.exclude.armor);
      return {
        title: '排除防具',
        current: null,
        rarityFilter: true,
        defaultRarities: [10, 11, 12],
        items: data.armor
          .filter((a) => !ex.has(a.id))
          .map((a): PickerItem => ({
            id: a.id,
            name: a.name,
            rarity: a.rarity,
            search: a.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' '),
            icon: <GameIcon src={iconUrl.equip(a.slot, a.rarity)} size={28} />,
            meta: `${SLOT_LABELS[a.slot]} · ${a.skills.map((s) => `${idx.skills.get(s.id)?.name ?? ''} ${s.level}`).join('、') || '无技能'}`,
          })),
      };
    }
    if (picking === 'charm') {
      const ex = new Set(cond.exclude.charms);
      return {
        title: '排除护石',
        current: null,
        layout: 'grid',
        rarityFilter: true,
        items: data.charms
          .filter((c) => !ex.has(c.id))
          .map((c): PickerItem => ({
            id: c.id,
            name: c.name,
            rarity: c.rarity,
            search: c.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' '),
            icon: <GameIcon src={iconUrl.equip('charm', c.rarity)} size={36} />,
            meta: c.skills.map((s) => `${idx.skills.get(s.id)?.name ?? ''} ${s.level}`).join('、'),
          })),
      };
    }
    if (picking === 'deco') {
      const ex = new Set(cond.exclude.decos);
      return {
        title: '排除饰品',
        current: null,
        layout: 'grid',
        items: data.decorations
          .filter((d) => !ex.has(d.id))
          .sort((a, b) => b.size - a.size || a.id - b.id)
          .map((d): PickerItem => ({
            id: d.id,
            name: d.name,
            rarity: d.rarity,
            search: d.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' '),
            icon: <GameIcon src={iconUrl.deco(d.size, d.iconColor)} size={36} />,
            meta: d.skills.map((s) => `${idx.skills.get(s.id)?.name ?? ''} ${s.level}`).join('、'),
          })),
      };
    }
    return null;
  };

  const onPick = (id: number | null) => {
    const kind = picking;
    setPicking(null);
    if (id == null || !kind) return;
    if (kind === 'skill') {
      const s = idx.skills.get(id);
      update((c) => ({ ...c, skills: [...c.skills, { id, level: s?.baseMaxLevel ?? 1 }] }));
    } else if (kind === 'set') {
      const s = idx.skills.get(id);
      update((c) => ({ ...c, sets: [...c.sets, { id, level: s?.levels[0]?.level ?? 2 }] }));
    } else if (kind === 'armor') toggleExclude('armor', id);
    else if (kind === 'charm') toggleExclude('charms', id);
    else toggleExclude('decos', id);
  };

  const pp = pickerProps();
  const canSearch = cond.skills.length > 0 || cond.sets.length > 0;

  return (
    <div className="gb-as">
      <section className="gb-panel gb-as__form" aria-label="搜索条件">
        {/* 武器：直接在这里选（与手动配装共用同一把），客制可展开设置 */}
        <div className="gb-as__group">
          <h3 className="gb-h gb-h--sub">武器</h3>
          {weapon ? (
            <div className="gb-as__wcard" data-off={useWeapon ? undefined : ''}>
              <span
                className="gb-as__wicon"
                style={{ ['--rar' as string]: `var(--gb-rarity-${weapon.rarity})` }}
              >
                <GameIcon src={iconUrl.weapon(build.weaponType, weapon.rarity)} size={34} />
              </span>
              <span className="gb-as__winfo">
                <span className="gb-as__wname">
                  <small style={{ ['--rar' as string]: `var(--gb-rarity-${weapon.rarity})` }}>
                    R{weapon.rarity}
                  </small>
                  {weapon.name}
                </span>
                <span className="gb-as__wstats">
                  攻击 {Math.round((weapon.attack + bonus.attack) * (idx.bloat[build.weaponType] ?? 1))}
                  {' · '}会心 {weapon.affinity + bonus.affinity}%
                  {weapon.element
                    ? ` · ${ELEMENT_NAMES[weapon.element.type] ?? ''} ${(weapon.element.value + bonus.element) * 10}`
                    : ''}
                </span>
              </span>
              <SlotIcons slots={weaponSlots(build, idx)} extraFrom={weapon.slots.length} />
              <span className="gb-as__wbtns">
                <button type="button" className="gb-btn" onClick={onPickWeapon}>
                  更换
                </button>
                <button type="button" className="gb-btn gb-btn--ghost" onClick={onClearWeapon}>
                  卸下
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className="gb-as__wpick" onClick={onPickWeapon}>
              <GameIcon src={iconUrl.empty.weapon(build.weaponType)} size={30} />
              <span>
                选择{weaponTypeName}
                <small>按稀有度、属性筛选，卡片上列出攻击、斩味与镶嵌槽</small>
              </span>
            </button>
          )}
          {weapon && customKind(weapon) && (
            <details className="gb-as__custom">
              <summary>
                <span>{customKind(weapon) === 'awakening' ? '觉醒能力' : '自定义强化'}</span>
                <small>{customSummary || '未设定'}</small>
              </summary>
              {renderCustom(weapon)}
            </details>
          )}
          <div className="gb-as__weapon" role="radiogroup" aria-label="搜索时的武器">
            <label className="gb-as__radio" data-disabled={weapon ? undefined : ''}>
              <input
                type="radio"
                name="gb-as-weapon"
                checked={useWeapon}
                disabled={!weapon}
                onChange={() => update((c) => ({ ...c, useWeapon: true }))}
              />
              <span>
                用这把武器
                <small>镶嵌槽含自定义强化追加的槽，武器技能与觉醒的系列技能也计入</small>
              </span>
            </label>
            <label className="gb-as__radio">
              <input
                type="radio"
                name="gb-as-weapon"
                checked={!useWeapon}
                onChange={() => update((c) => ({ ...c, useWeapon: false }))}
              />
              <span>
                不指定武器
                <small>只按下面的镶嵌槽搜索</small>
              </span>
              <span className="gb-as__slotpick">
                {cond.weaponSlots.map((s, i) => (
                  <Dropdown
                    key={i}
                    label={`第 ${i + 1} 个槽`}
                    className="gb-as__slotdd"
                    value={s}
                    disabled={useWeapon}
                    options={SLOT_OPTIONS}
                    onChange={(v) =>
                      update((c) => {
                        c.weaponSlots[i] = v;
                        return c;
                      })
                    }
                  />
                ))}
              </span>
            </label>
          </div>
        </div>

        {/* 技能 */}
        <div className="gb-as__group">
          <h3 className="gb-h gb-h--sub">
            技能
            <button
              type="button"
              className="gb-btn gb-btn--ghost gb-as__add"
              onClick={() => setPicking('skill')}
            >
              ＋ 添加
            </button>
          </h3>
          {cond.skills.length === 0 && <p className="gb-note">点「添加」选择想要的技能与等级。</p>}
          <ul className="gb-as__skills">
            {cond.skills.map((t, i) => {
              const s = idx.skills.get(t.id);
              if (!s) return null;
              return (
                <li key={t.id}>
                  <GameIcon src={iconUrl.skill(s.iconColor)} size={26} />
                  <span className="gb-as__skillname">{s.name}</span>
                  <LevelPicker
                    level={t.level}
                    max={s.maxLevel}
                    base={s.baseMaxLevel}
                    label={s.name}
                    onChange={(lv) =>
                      update((c) => {
                        c.skills[i]!.level = lv;
                        return c;
                      })
                    }
                  />
                  <button
                    type="button"
                    className="gb-as__remove"
                    aria-label={`移除 ${s.name}`}
                    onClick={() => update((c) => ({ ...c, skills: c.skills.filter((x) => x.id !== t.id) }))}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          {cond.skills.some((t) => (idx.skills.get(t.id)?.baseMaxLevel ?? 99) < t.level) && (
            <p className="gb-note">
              紫色等级需要对应的极意（套装技能）才能突破，搜索会自动要求满足其中一条。
            </p>
          )}
        </div>

        {/* 套装技能 */}
        <div className="gb-as__group">
          <h3 className="gb-h gb-h--sub">
            套装技能
            <button
              type="button"
              className="gb-btn gb-btn--ghost gb-as__add"
              onClick={() => setPicking('set')}
            >
              ＋ 添加
            </button>
          </h3>
          <ul className="gb-as__skills">
            {cond.sets.map((t, i) => {
              const s = idx.skills.get(t.id);
              if (!s) return null;
              return (
                <li key={t.id}>
                  <GameIcon src={iconUrl.skill(s.iconColor)} size={26} />
                  <span className="gb-as__skillname">{s.name}</span>
                  <span className="gb-as__tiers" role="radiogroup" aria-label={`${s.name} 件数`}>
                    {s.levels.map((l) => (
                      <button
                        key={l.level}
                        type="button"
                        role="radio"
                        aria-checked={t.level === l.level}
                        title={l.desc}
                        className="gb-chip"
                        onClick={() =>
                          update((c) => {
                            c.sets[i]!.level = l.level;
                            return c;
                          })
                        }
                      >
                        {l.level} 件
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="gb-as__remove"
                    aria-label={`移除 ${s.name}`}
                    onClick={() => update((c) => ({ ...c, sets: c.sets.filter((x) => x.id !== t.id) }))}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 条件 */}
        <div className="gb-as__group gb-as__opts">
          <div>
            <span id="gb-as-rarity">防具 / 护石稀有度</span>
            <Dropdown
              labelledBy="gb-as-rarity"
              value={cond.minRarity}
              options={RARITY_OPTIONS}
              onChange={(v) => update((c) => ({ ...c, minRarity: v }))}
            />
          </div>
          <div>
            <span id="gb-as-limit">最多列出</span>
            <Dropdown
              labelledBy="gb-as-limit"
              value={cond.limit}
              options={LIMIT_OPTIONS}
              onChange={(v) => update((c) => ({ ...c, limit: v }))}
            />
          </div>
        </div>

        {/* 排除 */}
        <div className="gb-as__group">
          <h3 className="gb-h gb-h--sub">排除</h3>
          <ExcludeList
            label="防具"
            items={cond.exclude.armor.map((id) => {
              const a = idx.armor.get(id);
              return { id, name: a?.name ?? `#${id}`, icon: a ? iconUrl.equip(a.slot, a.rarity) : null };
            })}
            onAdd={() => setPicking('armor')}
            onRemove={(id) => toggleExclude('armor', id)}
          />
          <ExcludeList
            label="护石"
            items={cond.exclude.charms.map((id) => {
              const c = idx.charms.get(id);
              return { id, name: c?.name ?? `#${id}`, icon: c ? iconUrl.equip('charm', c.rarity) : null };
            })}
            onAdd={() => setPicking('charm')}
            onRemove={(id) => toggleExclude('charms', id)}
          />
          <ExcludeList
            label="饰品"
            items={cond.exclude.decos.map((id) => {
              const d = idx.decorations.get(id);
              return { id, name: d?.name ?? `#${id}`, icon: d ? iconUrl.deco(d.size, d.iconColor) : null };
            })}
            onAdd={() => setPicking('deco')}
            onRemove={(id) => toggleExclude('decos', id)}
          />
        </div>

        <div className="gb-as__actions">
          <button type="button" className="gb-btn gb-btn--primary" disabled={!canSearch} onClick={run}>
            {status.state === 'running' ? '重新搜索' : '搜索'}
          </button>
          <button
            type="button"
            className="gb-btn gb-btn--ghost"
            onClick={() => setCond((c) => ({ ...emptyConditions(), useWeapon: c.useWeapon }))}
          >
            清空条件
          </button>
        </div>
      </section>

      <section className="gb-as__results" aria-label="搜索结果" aria-busy={status.state === 'running'}>
        <header className="gb-as__head">
          <h2 className="gb-h">
            搜索结果
            {status.state === 'done' && (
              <small>
                （搜到 {status.stats.found}
                {status.stats.truncated ? '+' : ''} 个，用时 {Math.max(1, Math.round(status.ms))} ms）
              </small>
            )}
            {status.state === 'running' && <small>（搜索中… 已找到 {results.length} 个）</small>}
          </h2>
          {results.length > 1 && (
            <div className="gb-as__sort">
              <span id="gb-as-sort">排序</span>
              <Dropdown labelledBy="gb-as-sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
            </div>
          )}
        </header>
        {status.state === 'idle' && (
          <p className="gb-note gb-as__empty">
            选好技能后点「搜索」。会列出所有能凑出这些技能的防具、护石与饰品组合，按需要排除不想用的装备。
          </p>
        )}
        {status.state === 'error' && <p className="gb-error">搜索出错：{status.message}</p>}
        {status.state === 'done' && results.length === 0 && (
          <p className="gb-note gb-as__empty">
            没有满足条件的组合。可以降低某个技能的等级、减少排除项，或换槽更多的武器。
          </p>
        )}
        {status.state === 'done' && status.stats.truncated && (
          <p className="gb-note">
            方案太多，只列出了前 {status.stats.found} 个；加上更多技能条件可以缩小范围。
          </p>
        )}
        <div className="gb-plans">
          {sorted.slice(0, shown).map((r, i) => (
            <PlanCard
              key={planKey(r)}
              n={i + 1}
              plan={r}
              build={build}
              idx={previewIdx}
              useWeapon={useWeapon}
              targets={new Set(cond.skills.map((s) => s.id))}
              onApply={() => onApply(r)}
              onExclude={(id) => toggleExclude('armor', id)}
            />
          ))}
        </div>
        {sorted.length > shown && (
          <button type="button" className="gb-btn gb-as__more" onClick={() => setShown((n) => n + PAGE)}>
            显示更多（还有 {sorted.length - shown} 个）
          </button>
        )}
      </section>

      {pp && <Picker {...pp} onPick={onPick} onClose={() => setPicking(null)} />}
    </div>
  );
}

const planKey = (r: SearchResult) =>
  `${ARMOR_SLOTS.map((s) => r.armor[s] ?? 0).join('-')}|${r.charm ?? 0}|${r.decorations.weapon.join(',')}`;

/** 技能等级选择：一排格子，点第 n 格即要求 n 级；超过基础上限的格子为紫色（需要极意） */
function LevelPicker({
  level,
  max,
  base,
  label,
  onChange,
}: {
  level: number;
  max: number;
  base: number;
  label: string;
  onChange: (lv: number) => void;
}) {
  return (
    <span className="gb-as__levels" role="radiogroup" aria-label={`${label} 等级`}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={level === i + 1}
          aria-label={`${i + 1} 级`}
          data-on={i < level ? '' : undefined}
          data-secret={i >= base ? '' : undefined}
          onClick={() => onChange(i + 1)}
        />
      ))}
      <b>{level}</b>
    </span>
  );
}

/** 一排镶嵌槽图标；extraFrom 之后的是自定义强化 / 觉醒追加的槽，右上角带金色「＋」 */
function SlotIcons({ slots, extraFrom }: { slots: number[]; extraFrom?: number }) {
  return (
    <span className="gb-as__sloticons">
      {slots.map((s, i) =>
        extraFrom != null && i >= extraFrom ? (
          <span key={i} className="gb-slot-plus" title="自定义强化 / 觉醒追加的镶嵌槽">
            <GameIcon src={iconUrl.socket(s)} size={18} alt={`${s} 级槽（追加）`} />
          </span>
        ) : (
          <GameIcon key={i} src={iconUrl.socket(s)} size={18} alt={`${s} 级槽`} />
        ),
      )}
    </span>
  );
}

function ExcludeList({
  label,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  items: { id: number; name: string; icon: string | null }[];
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="gb-as__exclude">
      <span className="gb-as__exlabel">{label}</span>
      <span className="gb-as__chips">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className="gb-as__chip"
            title="取消排除"
            aria-label={`取消排除 ${it.name}`}
            onClick={() => onRemove(it.id)}
          >
            {it.icon && <GameIcon src={it.icon} size={18} />}
            {it.name}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        <button type="button" className="gb-as__chip gb-as__chip--add" onClick={onAdd}>
          ＋
        </button>
      </span>
    </div>
  );
}

/** 一个方案：照游戏的配装一览排版——左边装备，右边技能格（两列）与套装，底部饰品汇总 */
function PlanCard({
  n,
  plan,
  build,
  idx,
  useWeapon,
  targets,
  onApply,
  onExclude,
}: {
  n: number;
  plan: SearchResult;
  build: Build;
  idx: Index;
  useWeapon: boolean;
  targets: Set<number>;
  onApply: () => void;
  onExclude: (armorId: number) => void;
}) {
  const preview = useMemo(() => previewBuild(plan, build, useWeapon), [plan, build, useWeapon]);
  const skills = useMemo(() => computeSkills(preview, idx), [preview, idx]);
  // 目标技能在前（按搜索条件的顺序），附带的技能按等级排
  const order = [...targets];
  const normal = skills
    .filter((t) => !t.skill.setBonus && t.level > 0)
    .sort((a, b) => {
      const ia = order.indexOf(a.skill.id);
      const ib = order.indexOf(b.skill.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return b.level - a.level || a.skill.id - b.skill.id;
    });
  const sets = skills
    .filter((t) => t.skill.setBonus && t.counted > 0)
    .sort((a, b) => b.activeSetLevels.length - a.activeSetLevels.length || b.counted - a.counted);
  const weapon = preview.weapon.id == null ? undefined : idx.weapons.get(preview.weapon.id);
  const realWeapon = weapon && weapon.id !== VIRTUAL_WEAPON ? weapon : undefined;

  // 饰品汇总：同一颗合并计数
  const decoCount = new Map<number, number>();
  for (const d of [...plan.decorations.weapon, ...ARMOR_SLOTS.flatMap((s) => plan.decorations.armor[s])])
    if (d != null) decoCount.set(d, (decoCount.get(d) ?? 0) + 1);
  const decos = [...decoCount.entries()]
    .flatMap(([id, count]) => {
      const d = idx.decorations.get(id);
      return d ? [{ d, count }] : [];
    })
    .sort((a, b) => b.d.size - a.d.size || b.count - a.count || a.d.id - b.d.id);

  return (
    <article className="gb-plan" aria-label={`方案 ${n}`}>
      <header className="gb-plan__head">
        <h3>方案 {n}</h3>
        <span className="gb-plan__meta" title="五件防具的基础防御力合计">
          防御 <b>{plan.defense}</b>
        </span>
        {plan.freeSlots.length > 0 && (
          <span className="gb-plan__meta" title="没用上的镶嵌槽">
            空槽 <SlotIcons slots={plan.freeSlots} />
          </span>
        )}
        <button type="button" className="gb-plan__apply" onClick={onApply}>
          应用此方案
        </button>
      </header>

      <div className="gb-plan__body">
        <ul className="gb-plan__equip">
          <EquipLine
            icon={
              realWeapon
                ? iconUrl.weapon(build.weaponType, realWeapon.rarity)
                : iconUrl.empty.weapon(build.weaponType)
            }
            name={realWeapon?.name ?? '指定镶嵌槽'}
          />
          {ARMOR_SLOTS.map((slot) => {
            const id = plan.armor[slot];
            const a = id == null ? undefined : idx.armor.get(id);
            const alts = plan.alternatives[slot].flatMap((x) => idx.armor.get(x)?.name ?? []);
            return (
              <EquipLine
                key={slot}
                icon={a ? iconUrl.equip(slot, a.rarity) : iconUrl.empty.equip(slot)}
                name={a?.name ?? `${SLOT_LABELS[slot]}（任意）`}
                empty={!a}
                extra={
                  <>
                    {alts.length > 0 && (
                      <small className="gb-plan__alts" title={`技能与可用槽相同，可换成：${alts.join('、')}`}>
                        +{alts.length}
                      </small>
                    )}
                    {a && (
                      <button
                        type="button"
                        className="gb-plan__ex"
                        aria-label={`排除 ${a.name}`}
                        title="排除这件防具后重新搜索"
                        onClick={() => onExclude(a.id)}
                      >
                        ×
                      </button>
                    )}
                  </>
                }
              />
            );
          })}
          <CharmLine plan={plan} idx={idx} />
          {/* 与游戏的配装一览一致，衣装栏也列出来（搜索不考虑衣装） */}
          <EquipLine icon={iconUrl.empty.mantle()} name="衣装 1" empty />
          <EquipLine icon={iconUrl.empty.mantle()} name="衣装 2" empty />
        </ul>

        <div className="gb-plan__skills">
          <ul className="gb-plan__grid">
            {normal.map((t) => (
              <PlanSkill key={t.skill.id} t={t} target={targets.has(t.skill.id)} />
            ))}
          </ul>
          {sets.length > 0 && (
            <div className="gb-plan__sets">
              {sets.map((t) => (
                <PlanSet key={t.skill.id} t={t} plan={plan} idx={idx} build={build} weapon={realWeapon} />
              ))}
            </div>
          )}
        </div>
      </div>

      {decos.length > 0 && (
        <ul className="gb-plan__decos" aria-label="饰品">
          {decos.map(({ d, count }) => (
            <li key={d.id}>
              <span className="gb-plan__tile">
                <GameIcon src={iconUrl.deco(d.size, d.iconColor)} size={20} />
              </span>
              <span>{d.name}</span>
              {count > 1 && <b>×{count}</b>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function CharmLine({ plan, idx }: { plan: SearchResult; idx: Index }) {
  const c = plan.charm == null ? undefined : idx.charms.get(plan.charm);
  return (
    <EquipLine
      icon={c ? iconUrl.equip('charm', c.rarity) : iconUrl.empty.equip('charm')}
      name={c?.name ?? '护石（任意）'}
      empty={!c}
    />
  );
}

function EquipLine({
  icon,
  name,
  empty = false,
  extra,
}: {
  icon: string;
  name: string;
  empty?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <li data-empty={empty ? '' : undefined}>
      <span className="gb-plan__tile">
        <GameIcon src={icon} size={22} />
      </span>
      <span className="gb-plan__name">{name}</span>
      {extra}
    </li>
  );
}

/**
 * 技能格：图标、名字、等级格 + 一条细线拉到右边的「等级 N」。
 * 等级格的颜色：搜索目标为金色、附带的技能为绿色、极意突破的等级为紫色。
 */
function PlanSkill({ t, target }: { t: SkillTotal; target: boolean }) {
  // 没解锁极意时只画基础上限那么多格
  const max = t.cap < t.skill.maxLevel ? t.cap : t.skill.maxLevel;
  return (
    <li className="gb-plan__skill" data-target={target ? '' : undefined}>
      <GameIcon src={iconUrl.skill(t.skill.iconColor)} size={32} />
      <span className="gb-plan__skname">{t.skill.name}</span>
      <span className="gb-plan__track" aria-label={`等级 ${t.level} / ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <i
            key={i}
            data-on={i < t.level ? '' : undefined}
            data-secret={i >= t.skill.baseMaxLevel ? '' : undefined}
          />
        ))}
        {t.over > 0 && <small title="超出上限的点数">+{t.over}</small>}
        <span className="gb-plan__line" aria-hidden="true" />
        <span className="gb-plan__lv">
          等级 <b>{t.level}</b>
        </span>
      </span>
    </li>
  );
}

/** 套装：武器 + 五件防具的方块（计入的为金底），下面列出各档的名字，已发动的为橙色 */
function PlanSet({
  t,
  plan,
  idx,
  build,
  weapon,
}: {
  t: SkillTotal;
  plan: SearchResult;
  idx: Index;
  build: Build;
  weapon: WeaponData | undefined;
}) {
  const weaponOn = t.sources.some((s) => s.kind === 'weapon');
  return (
    <div className="gb-plan__set" data-active={t.activeSetLevels.length ? '' : undefined}>
      <span className="gb-plan__setname">{t.skill.name}</span>
      <span className="gb-plan__pieces" aria-label={`${t.counted} 件`}>
        <span className="gb-plan__tile" data-set="">
          <GameIcon src={iconUrl.skill(t.skill.iconColor)} size={20} />
        </span>
        <span className="gb-plan__tile" data-on={weaponOn ? '' : undefined}>
          <GameIcon
            src={
              weapon
                ? iconUrl.weapon(build.weaponType, weapon.rarity)
                : iconUrl.empty.weapon(build.weaponType)
            }
            size={18}
          />
        </span>
        {ARMOR_SLOTS.map((slot) => {
          const id = plan.armor[slot];
          const a = id == null ? undefined : idx.armor.get(id);
          const on = a?.setSkill?.id === t.skill.id;
          return (
            <span key={slot} className="gb-plan__tile" data-on={on ? '' : undefined}>
              <GameIcon src={a ? iconUrl.equip(slot, a.rarity) : iconUrl.empty.equip(slot)} size={18} />
            </span>
          );
        })}
      </span>
      <ol className="gb-plan__tiers">
        {t.skill.levels.map((l) => (
          <li key={l.level} data-on={t.activeSetLevels.includes(l.level) ? '' : undefined} title={l.desc}>
            <b>{l.level}</b>
            <span aria-hidden="true">▸</span>
            {l.name ?? `${l.level} 件`}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 方案对应的配装（预览用）：衣装不计入，武器槽用当前武器或虚拟武器 */
function previewBuild(plan: SearchResult, build: Build, useWeapon: boolean): Build {
  const b = structuredClone(build);
  if (!useWeapon) {
    b.weapon = { id: VIRTUAL_WEAPON, decos: [] };
    b.custom = { augments: [], hr: [], parts: [], awakening: [] };
  }
  b.weapon.decos = plan.decorations.weapon;
  for (const s of ARMOR_SLOTS) b.armor[s] = { id: plan.armor[s], decos: plan.decorations.armor[s] };
  b.charm = plan.charm;
  b.mantleActive = false;
  return b;
}

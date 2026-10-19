/**
 * 配装器（v0）：布局贴近游戏的装备 / 饰品界面——左侧装备一览（每件装备右侧列出镶嵌槽与已镶饰品），
 * 中间是选中装备的详情，右侧是技能与状态。数据来自 /data/world/*.json，图标来自游戏 UI 贴图。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ARMOR_SLOTS,
  awakeningConflict,
  customBonus,
  customKind,
  availableConditions,
  sharpnessBar,
  SHARPNESS_COLORS,
  type SharpnessBar as SharpnessBarData,
  chosenAwakening,
  computeSkills,
  computeStats,
  emptyBuild,
  emptyCustom,
  emptyPiece,
  fitDecos,
  makeIndex,
  pruneAugments,
  setAugment,
  weaponSlots,
  type ArmorSlot,
  type Build,
  type BuilderData,
  type Index,
  type Piece,
  type SkillTotal,
  type WeaponData,
  type WeaponPayload,
} from '../../lib/world/builder';
import type { SearchResult } from '../../lib/world/search';
import { buildFromHash, shareUrl } from '../../lib/world/share';
import AutoSearch from './AutoSearch';
import Picker from './Picker';
import WeaponPicker from './WeaponPicker';
import WeaponCustomPanel, {
  AWAKENING_GROUPS,
  ROMAN,
  awakeningMeta,
  type CustomVariant,
} from './WeaponCustom';
import { GameIcon, iconUrl, LevelBoxes } from './icons';
import './builder.css';
import { WEAPON_TYPE_NAMES } from '../../lib/world/weapons';

const SLOT_NAMES: Record<ArmorSlot, string> = {
  head: '头部',
  chest: '身体',
  arms: '腕部',
  waist: '腰部',
  legs: '脚部',
};
const ELEMENT_NAMES: Record<string, string> = {
  fire: '火属性',
  water: '水属性',
  ice: '冰属性',
  thunder: '雷属性',
  dragon: '龙属性',
  poison: '毒',
  paralysis: '麻痹',
  sleep: '睡眠',
  blast: '爆破',
};
const RESIST = ['火', '水', '雷', '冰', '龙'] as const;
// 龙封力：3 = 大 已核对；1 / 2 按顺序推断
const ELDERSEAL = ['—', '小', '中', '大'];
const STORAGE_KEY = 'mhdb-builder-v0';
const MODE_KEY = 'mhdb-builder-mode';

/** 选中的装备栏位 */
type Target =
  | { kind: 'weapon' }
  | { kind: 'armor'; slot: ArmorSlot }
  | { kind: 'charm' }
  | { kind: 'mantle'; index: 0 | 1 };

/** 正在打开的选择器 */
type Picking = { target: Target; deco?: number; awakening?: number } | null;

function loadSaved(): Build {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Build>;
      return {
        ...emptyBuild(),
        ...saved,
        custom: { ...emptyCustom(), ...saved.custom },
        conditions: saved.conditions ?? [],
      };
    }
  } catch {
    /* 忽略损坏的存档 */
  }
  return emptyBuild();
}

/**
 * 初始配装：地址里有分享链接（#b=…）时用它，并把片段从地址栏去掉；本机原来的配装放进撤销历史，
 * 点「撤销」能回到自己的配装。没有分享链接时读本机存档。
 */
function initialHistory(): History {
  const shared = buildFromHash(location.hash);
  if (shared) {
    history.replaceState(null, '', location.pathname + location.search);
    return { past: [loadSaved()], present: shared, future: [] };
  }
  return { past: [], present: loadSaved(), future: [] };
}

const HISTORY_LIMIT = 100;

interface History {
  past: Build[];
  present: Build;
  future: Build[];
}

export default function Builder() {
  const [data, setData] = useState<BuilderData | null>(null);
  const [payload, setPayload] = useState<WeaponPayload>({ weapons: [], parts: [], awakening: [] });
  // 组件只在客户端渲染（client:only），可以直接从 localStorage / 地址初始化。
  // 配装带撤销 / 重做历史：每次修改把旧值压进 past，撤销时取回
  const [hist, setHist] = useState<History>(initialHistory);
  const build = hist.present;
  const setBuild = useCallback((next: Build | ((b: Build) => Build)) => {
    setHist((h) => {
      const value = typeof next === 'function' ? next(h.present) : next;
      if (value === h.present || JSON.stringify(value) === JSON.stringify(h.present)) return h;
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: value, future: [] };
    });
  }, []);
  const undo = useCallback(
    () =>
      setHist((h) =>
        h.past.length
          ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] }
          : h,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHist((h) =>
        h.future.length
          ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) }
          : h,
      ),
    [],
  );
  const [shareNote, setShareNote] = useState<string | null>(null);
  useEffect(() => {
    if (!shareNote) return;
    const t = setTimeout(() => setShareNote(null), 6000);
    return () => clearTimeout(t);
  }, [shareNote]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable]') || !(e.ctrlKey || e.metaKey))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  const [selected, setSelected] = useState<Target>({ kind: 'weapon' });
  const [picking, setPicking] = useState<Picking>(null);
  const [error, setError] = useState<string | null>(null);
  // 手动配装 / 自动配装
  const [mode, setMode] = useState<'manual' | 'auto'>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'auto' ? 'auto' : 'manual';
    } catch {
      return 'manual';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [mode]);

  useEffect(() => {
    fetch('/data/world/builder.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BuilderData) => setData(d))
      .catch((e: unknown) => setError(`数据加载失败：${String(e)}`));
  }, []);

  useEffect(() => {
    fetch(`/data/world/weapons/${build.weaponType}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((w: WeaponPayload) => setPayload(w))
      .catch((e: unknown) => setError(`武器数据加载失败：${String(e)}`));
  }, [build.weaponType]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(build));
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [build]);

  const idx = useMemo(() => (data ? makeIndex(data, payload) : null), [data, payload]);
  const skills = useMemo(() => (idx ? computeSkills(build, idx) : []), [build, idx]);
  const stats = useMemo(() => (idx ? computeStats(build, idx, skills) : null), [build, idx, skills]);

  const update = useCallback(
    (fn: (b: Build) => Build) => setBuild((b) => fn(structuredClone(b))),
    [setBuild],
  );

  if (error) return <p className="gb-error">{error}</p>;
  if (!data || !idx || !stats) return <BuilderSkeleton />;

  const pieceOf = (t: Target): Piece | null =>
    t.kind === 'weapon'
      ? build.weapon
      : t.kind === 'armor'
        ? build.armor[t.slot]
        : t.kind === 'mantle'
          ? build.mantles[t.index]
          : null;

  // 武器本身的槽数；之后的槽是自定义强化（冥赤龙武器为觉醒能力）追加的
  const baseWeaponSlots = build.weapon.id == null ? 0 : (idx.weapons.get(build.weapon.id)?.slots.length ?? 0);
  const extraTag =
    customKind(build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id)) === 'awakening'
      ? '觉醒'
      : '强化';

  const slotsOf = (t: Target): number[] => {
    const p = pieceOf(t);
    if (!p || p.id == null) return [];
    if (t.kind === 'weapon') return weaponSlots(build, idx);
    if (t.kind === 'armor') return idx.armor.get(p.id)?.slots ?? [];
    if (t.kind === 'mantle') return idx.mantles.get(p.id)?.slots ?? [];
    return [];
  };

  const setPiece = (t: Target, id: number | null) =>
    update((b) => {
      if (t.kind === 'charm') {
        b.charm = id;
        return b;
      }
      const p = t.kind === 'weapon' ? b.weapon : t.kind === 'armor' ? b.armor[t.slot] : b.mantles[t.index];
      // 换武器时客制一并清空（自定义强化、零件、觉醒都跟具体武器绑定）
      if (t.kind === 'weapon' && p.id !== id) b.custom = emptyCustom();
      p.id = id;
      const slots =
        id == null
          ? []
          : t.kind === 'weapon'
            ? (idx.weapons.get(id)?.slots ?? [])
            : t.kind === 'armor'
              ? (idx.armor.get(id)?.slots ?? [])
              : (idx.mantles.get(id)?.slots ?? []);
      p.decos = fitDecos(slots, p.decos, idx);
      // 存档里可能留着换武器前超上限的强化，按新武器的格数裁一遍
      if (t.kind === 'weapon') b.custom = pruneAugments(b.custom, idx, idx.weapons.get(id ?? -1));
      return b;
    });

  const setDeco = (t: Target, i: number, id: number | null) =>
    update((b) => {
      const p =
        t.kind === 'weapon'
          ? b.weapon
          : t.kind === 'armor'
            ? b.armor[t.slot]
            : t.kind === 'mantle'
              ? b.mantles[t.index]
              : null;
      if (p) {
        while (p.decos.length <= i) p.decos.push(null);
        p.decos[i] = id;
      }
      return b;
    });

  const setAwakening = (slot: number, id: number | null) =>
    update((b) => {
      while (b.custom.awakening.length <= slot) b.custom.awakening.push(null);
      b.custom.awakening[slot] = id;
      return b;
    });

  const pickerFor = (
    pk: NonNullable<Picking>,
  ): Omit<React.ComponentProps<typeof Picker>, 'onPick' | 'onClose'> => {
    const t = pk.target;
    if (pk.awakening != null) {
      const slot = pk.awakening;
      const chosen = chosenAwakening(build, idx);
      const group = (id: number) => AWAKENING_GROUPS[idx.awakening.get(id)?.category ?? ''] ?? '武器专属';
      return {
        title: `觉醒能力（第 ${slot + 1} 栏）`,
        current: chosen[slot]?.id ?? null,
        placeholder: '能力名称',
        filters: [
          { key: 'all', label: '全部', test: () => true },
          ...['基础', '系列技能', '武器专属'].map((g) => ({
            key: g,
            label: g,
            test: (id: number) => group(id) === g,
          })),
        ],
        items: payload.awakening.map((a) => {
          const conflict = awakeningConflict(chosen, slot, a);
          return {
            id: a.id,
            name: a.name,
            search: a.desc,
            icon: (
              <span className="gb-awk__rank" data-rank={a.rank}>
                {ROMAN[a.rank]}
              </span>
            ),
            meta: awakeningMeta(a),
            ...(conflict ? { disabled: conflict } : {}),
          };
        }),
      };
    }
    if (pk.deco != null) {
      const size = slotsOf(t)[pk.deco] ?? 0;
      const deco = (id: number) => idx.decorations.get(id);
      const sizes = [1, 2, 3, 4].filter((n) => n <= size);
      return {
        title: `选择饰品（${size} 级槽）`,
        layout: 'grid',
        placeholder: '饰品名或技能',
        current: pieceOf(t)?.decos[pk.deco] ?? null,
        filters: [
          { key: 'all', label: '全部', test: () => true },
          { key: 'single', label: '单技能', test: (id) => deco(id)?.skills.length === 1 },
          { key: 'combo', label: '复合珠', test: (id) => (deco(id)?.skills.length ?? 0) > 1 },
          ...(sizes.length > 1
            ? sizes.map((n) => ({
                key: `size-${n}`,
                title: `${n} 级饰品`,
                label: <GameIcon src={iconUrl.socket(n)} size={18} alt="" />,
                test: (id: number) => deco(id)?.size === n,
              }))
            : []),
        ],
        rarityFilter: true,
        sorts: [
          { key: 'default', label: '默认（等级 → 编号）', value: () => 0 },
          { key: 'rarity', label: '稀有度', value: (id) => deco(id)?.rarity ?? 0 },
          { key: 'size', label: '饰品等级', value: (id) => deco(id)?.size ?? 0 },
          { key: 'skills', label: '技能数', value: (id) => deco(id)?.skills.length ?? 0 },
        ],
        items: data.decorations
          .filter((d) => d.size <= size)
          .sort((a, b) => b.size - a.size || a.id - b.id)
          .map((d) => ({
            id: d.id,
            name: d.name,
            rarity: d.rarity,
            search: d.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' '),
            icon: <GameIcon src={iconUrl.deco(d.size, d.iconColor)} size={36} />,
            meta: <SkillRows refs={d.skills} idx={idx} />,
          })),
      };
    }
    if (t.kind === 'armor')
      return {
        title: `选择${SLOT_NAMES[t.slot]}防具`,
        current: build.armor[t.slot].id,
        rarityFilter: true,
        defaultRarities: [9, 10, 11, 12],
        sorts: [
          { key: 'default', label: '默认（游戏内顺序）', value: () => 0 },
          { key: 'rarity', label: '稀有度', value: (id) => idx.armor.get(id)?.rarity ?? 0 },
          { key: 'defense', label: '防御力', value: (id) => idx.armor.get(id)?.defense ?? 0 },
          { key: 'slots', label: '镶嵌槽', value: (id) => slotScore(idx.armor.get(id)?.slots ?? []) },
          {
            key: 'skills',
            label: '技能点数',
            value: (id) => (idx.armor.get(id)?.skills ?? []).reduce((n, s) => n + s.level, 0),
          },
        ],
        items: data.armor
          .filter((a) => a.slot === t.slot)
          .map((a) => ({
            id: a.id,
            name: a.name,
            rarity: a.rarity,
            search: `${a.series} ${a.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' ')}`,
            icon: <GameIcon src={iconUrl.equip(a.slot, a.rarity)} size={28} />,
            meta: (
              <>
                防御 {a.defense} · <SkillLine refs={a.skills} idx={idx} />
              </>
            ),
            side: <SlotDots slots={a.slots} />,
          })),
      };
    if (t.kind === 'charm')
      return {
        title: '选择护石',
        layout: 'grid',
        current: build.charm,
        rarityFilter: true,
        sorts: [
          { key: 'default', label: '默认（游戏内顺序）', value: () => 0 },
          { key: 'rarity', label: '稀有度', value: (id) => idx.charms.get(id)?.rarity ?? 0 },
          {
            key: 'skills',
            label: '技能点数',
            value: (id) => (idx.charms.get(id)?.skills ?? []).reduce((n, s) => n + s.level, 0),
          },
        ],
        items: data.charms.map((c) => ({
          id: c.id,
          name: c.name,
          rarity: c.rarity,
          search: c.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' '),
          icon: <GameIcon src={iconUrl.equip('charm', c.rarity)} size={36} />,
          meta: <SkillRows refs={c.skills} idx={idx} />,
        })),
      };
    // 武器本身由 WeaponPicker 负责，这里只剩衣装
    if (t.kind !== 'mantle') return { title: '', current: null, items: [] };
    return {
      title: '选择衣装',
      current: build.mantles[t.index].id,
      items: [...data.mantles]
        .filter((m) => m.id !== build.mantles[t.index === 0 ? 1 : 0].id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          icon: <GameIcon src={iconUrl.mantle(m.icon.id, m.icon.color)} size={28} />,
          side: <SlotDots slots={m.slots} />,
        })),
    };
  };

  const rows: { target: Target; label: string }[] = [
    { target: { kind: 'weapon' }, label: '武器' },
    ...ARMOR_SLOTS.map((slot) => ({ target: { kind: 'armor', slot } as Target, label: SLOT_NAMES[slot] })),
    { target: { kind: 'charm' }, label: '护石' },
    { target: { kind: 'mantle', index: 0 }, label: '衣装 1' },
    { target: { kind: 'mantle', index: 1 }, label: '衣装 2' },
  ];
  const same = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);

  // 稀有度颜色取自游戏的 ui_colortable（--gb-rarity-1 … 12）
  const rarityVars = Object.fromEntries(data.colors.rarity.map((c, i) => [`--gb-rarity-${i + 1}`, c]));

  /** 武器客制面板：手动配装的详情栏与自动配装的武器栏共用 */
  const customPanel = (w: WeaponData, variant: CustomVariant = 'panel') => (
    <WeaponCustomPanel
      variant={variant}
      weapon={w}
      build={build}
      idx={idx}
      onAugment={(category, level) =>
        update((b) => {
          b.custom = setAugment(b.custom, idx, category, level);
          // 取消扩充后可能超上限，按当前格数裁一遍
          b.custom = pruneAugments(b.custom, idx, idx.weapons.get(b.weapon.id ?? -1));
          b.weapon.decos = fitDecos(weaponSlots(b, idx), b.weapon.decos, idx);
          return b;
        })
      }
      onCustom={(fn) => update((b) => ({ ...b, custom: fn(b.custom) }))}
      onPickAwakening={(slot) => setPicking({ target: { kind: 'weapon' }, awakening: slot })}
    />
  );

  /** 把自动配装的方案写回手动配装：替换防具、护石与饰品，武器与衣装保留 */
  const applyPlan = (plan: SearchResult) => {
    update((b) => {
      for (const s of ARMOR_SLOTS) {
        const id = plan.armor[s];
        b.armor[s] = {
          id,
          decos: id == null ? [] : fitDecos(idx.armor.get(id)?.slots ?? [], plan.decorations.armor[s], idx),
        };
      }
      b.charm = plan.charm;
      if (b.weapon.id != null) b.weapon.decos = fitDecos(weaponSlots(b, idx), plan.decorations.weapon, idx);
      return b;
    });
    setSelected({ kind: 'weapon' });
    setMode('manual');
  };

  return (
    <div className="gb" style={rarityVars}>
      <div className="gb-modes" role="tablist" aria-label="配装方式">
        <button type="button" role="tab" aria-selected={mode === 'manual'} onClick={() => setMode('manual')}>
          手动配装
        </button>
        <button type="button" role="tab" aria-selected={mode === 'auto'} onClick={() => setMode('auto')}>
          自动配装
          <small>按技能搜索</small>
        </button>
      </div>
      <div className="gb-toolbar">
        <div className="gb-weapon-types" role="radiogroup" aria-label="武器种类">
          {Object.entries(WEAPON_TYPE_NAMES).map(([key, name]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={build.weaponType === key}
              title={name}
              onClick={() =>
                update((b) => {
                  if (b.weaponType !== key) {
                    b.weaponType = key;
                    b.weapon = { id: null, decos: [] };
                    b.custom = emptyCustom();
                  }
                  return b;
                })
              }
            >
              <GameIcon src={iconUrl.weapon(key, 12)} size={26} alt={name} />
            </button>
          ))}
        </div>
        <div className="gb-history">
          <button
            type="button"
            className="gb-btn gb-btn--ghost"
            title="撤销（Ctrl+Z）"
            disabled={hist.past.length === 0}
            onClick={undo}
          >
            撤销
          </button>
          <button
            type="button"
            className="gb-btn gb-btn--ghost"
            title="重做（Ctrl+Shift+Z / Ctrl+Y）"
            disabled={hist.future.length === 0}
            onClick={redo}
          >
            重做
          </button>
          <button
            type="button"
            className="gb-btn"
            title="把当前配装编码进链接并复制"
            onClick={() => {
              const url = shareUrl(location.origin, build);
              navigator.clipboard
                .writeText(url)
                .then(() => setShareNote('分享链接已复制'))
                .catch(() => setShareNote(url));
            }}
          >
            分享
          </button>
          {shareNote && (
            <span className="gb-share-note" role="status">
              {shareNote}
            </span>
          )}
        </div>
        {mode === 'manual' && (
          <>
            <label className="gb-switch" data-on={build.mantleActive ? '' : undefined}>
              <input
                type="checkbox"
                checked={build.mantleActive}
                onChange={(e) => update((b) => ({ ...b, mantleActive: e.target.checked }))}
              />
              <i aria-hidden="true" />
              衣装生效
            </label>
            <button
              type="button"
              className="gb-btn gb-btn--ghost"
              title="卸下所有装备与饰品"
              onClick={() => setBuild(emptyBuild(build.weaponType))}
            >
              清空
            </button>
            <button
              type="button"
              className="gb-btn gb-btn--ghost"
              title="只卸下五件防具（武器、护石、衣装保留）"
              onClick={() =>
                update((b) => {
                  for (const s of ARMOR_SLOTS) b.armor[s] = emptyPiece();
                  return b;
                })
              }
            >
              清空防具
            </button>
            <button
              type="button"
              className="gb-btn gb-btn--ghost"
              title="清掉所有镶嵌槽里的饰品（装备保留）"
              onClick={() =>
                update((b) => {
                  b.weapon.decos = [];
                  for (const s of ARMOR_SLOTS) b.armor[s].decos = [];
                  for (const m of b.mantles) m.decos = [];
                  return b;
                })
              }
            >
              清空珠子
            </button>
          </>
        )}
      </div>

      {mode === 'auto' && (
        <AutoSearch
          data={data}
          idx={idx}
          build={build}
          weaponTypeName={WEAPON_TYPE_NAMES[build.weaponType] ?? '武器'}
          onApply={applyPlan}
          onPickWeapon={() => setPicking({ target: { kind: 'weapon' } })}
          onClearWeapon={() => setPiece({ kind: 'weapon' }, null)}
          renderCustom={(w, variant) => customPanel(w, variant)}
        />
      )}

      {mode === 'manual' && (
        <div className="gb-main">
          <section className="gb-panel gb-equip" aria-label="装备">
            {rows.map(({ target, label }) => (
              <EquipRow
                key={label}
                label={label}
                target={target}
                build={build}
                idx={idx}
                selected={same(selected, target)}
                slots={slotsOf(target)}
                extraFrom={target.kind === 'weapon' ? baseWeaponSlots : undefined}
                extraTag={extraTag}
                onSelect={() => setSelected(target)}
                onPickPiece={() => {
                  setSelected(target);
                  setPicking({ target });
                }}
                onPickDeco={(i) => {
                  setSelected(target);
                  setPicking({ target, deco: i });
                }}
              />
            ))}
          </section>

          <section className="gb-panel gb-detail" aria-label="装备详情">
            <Detail
              target={selected}
              build={build}
              idx={idx}
              onChange={() => setPicking({ target: selected })}
              custom={(w) => customPanel(w)}
            />
          </section>

          <aside className="gb-side">
            <section className="gb-panel" aria-labelledby="gb-skills-h">
              <h2 id="gb-skills-h" className="gb-h">
                技能
              </h2>
              <SkillList skills={skills} mantleActive={build.mantleActive} />
            </section>
            <section className="gb-panel" aria-labelledby="gb-stats-h">
              <h2 id="gb-stats-h" className="gb-h">
                状态
              </h2>
              <Conditions
                skills={skills}
                on={build.conditions}
                onToggle={(key) =>
                  update((b) => ({
                    ...b,
                    conditions: b.conditions.includes(key)
                      ? b.conditions.filter((k) => k !== key)
                      : [...b.conditions, key],
                  }))
                }
              />
              <StatusList stats={stats} />
            </section>
          </aside>
        </div>
      )}

      <p className="gb-foot">
        {`数据版本：Steam 构建 ${data.meta.steamBuildId ?? '—'}。`}
        状态按游戏数据计算：技能（有发动条件的需在「发动条件」里打开）、
        自定义强化与觉醒能力；零件强化、锐利度修正、动作值与道具增益尚未计入。
      </p>

      {picking && isWeaponPick(picking) && (
        <WeaponPicker
          title={`选择${WEAPON_TYPE_NAMES[build.weaponType] ?? '武器'}`}
          weaponType={build.weaponType}
          weapons={payload.weapons}
          idx={idx}
          current={build.weapon.id}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            setPiece({ kind: 'weapon' }, id);
            setPicking(null);
          }}
        />
      )}
      {picking && !isWeaponPick(picking) && (
        <Picker
          {...pickerFor(picking)}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            if (picking.awakening != null) setAwakening(picking.awakening, id);
            else if (picking.deco != null) setDeco(picking.target, picking.deco, id);
            else setPiece(picking.target, id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

/** 选的是武器本身（不是武器上的饰品或觉醒能力） */
const isWeaponPick = (p: NonNullable<Picking>) =>
  p.target.kind === 'weapon' && p.deco == null && p.awakening == null;

/** 镶嵌槽排序用的分数：先比最高等级，再比个数（4·4 > 4·1 > 3·3·3） */
const slotScore = (slots: number[]) =>
  [...slots].sort((a, b) => b - a).reduce((n, s, i) => n + s * 10 ** (4 - i * 2), 0);

// ---------- 子组件 ----------

/** 一排镶嵌槽图标；extraFrom 之后的是自定义强化 / 觉醒追加的槽，右上角带金色「＋」 */
export function SlotDots({ slots, extraFrom }: { slots: number[]; extraFrom?: number }) {
  return (
    <span className="gb-slotdots">
      {slots.map((s, i) =>
        extraFrom != null && i >= extraFrom ? (
          <span key={i} className="gb-slot-plus" title="追加的镶嵌槽">
            <GameIcon src={iconUrl.socket(s)} size={20} alt={`${s} 级槽（追加）`} />
          </span>
        ) : (
          <GameIcon key={i} src={iconUrl.socket(s)} size={20} alt={`${s} 级槽`} />
        ),
      )}
    </span>
  );
}

function SkillLine({ refs, idx }: { refs: { id: number; level: number }[]; idx: Index }) {
  return <>{refs.map((r) => `${idx.skills.get(r.id)?.name ?? `#${r.id}`} ${r.level}`).join(' · ')}</>;
}

/** 卡片里的技能：每个技能一行，技能图标 + 名称 + 金色等级 */
function SkillRows({ refs, idx }: { refs: { id: number; level: number }[]; idx: Index }) {
  return (
    <>
      {refs.map((r) => {
        const sk = idx.skills.get(r.id);
        return (
          <span key={r.id} className="gb-skillrow">
            <GameIcon src={iconUrl.skill(sk?.iconColor ?? 0)} size={18} />
            <span>{sk?.name ?? `#${r.id}`}</span>
            <b>Lv{r.level}</b>
          </span>
        );
      })}
    </>
  );
}

interface RowProps {
  label: string;
  target: Target;
  build: Build;
  idx: Index;
  selected: boolean;
  slots: number[];
  /** 从第几个槽开始是追加的（自定义强化 / 觉醒） */
  extraFrom?: number | undefined;
  extraTag?: string;
  onSelect: () => void;
  onPickPiece: () => void;
  onPickDeco: (i: number) => void;
}

function EquipRow({
  label,
  target,
  build,
  idx,
  selected,
  slots,
  extraFrom,
  extraTag = '强化',
  onSelect,
  onPickPiece,
  onPickDeco,
}: RowProps) {
  // 未装备时用灰色占位图标（稀有度 0 的那一套），和游戏一样空栏位也画出来
  let name = '无装备';
  let icon = iconUrl.empty.weapon(build.weaponType);
  let rarity: number | null = null;
  let decos: (number | null)[] = [];
  if (target.kind === 'weapon') {
    const w = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
    if (w) [name, icon, rarity] = [w.name, iconUrl.weapon(build.weaponType, w.rarity), w.rarity];
    decos = build.weapon.decos;
  } else if (target.kind === 'armor') {
    const p = build.armor[target.slot];
    icon = iconUrl.empty.equip(target.slot);
    const a = p.id == null ? undefined : idx.armor.get(p.id);
    if (a) [name, icon, rarity] = [a.name, iconUrl.equip(a.slot, a.rarity), a.rarity];
    decos = p.decos;
  } else if (target.kind === 'charm') {
    icon = iconUrl.empty.equip('charm');
    const c = build.charm == null ? undefined : idx.charms.get(build.charm);
    if (c) [name, icon, rarity] = [c.name, iconUrl.equip('charm', c.rarity), c.rarity];
  } else {
    icon = iconUrl.empty.mantle();
    const p = build.mantles[target.index];
    const m = p.id == null ? undefined : idx.mantles.get(p.id);
    if (m) [name, icon] = [m.name, iconUrl.mantle(m.icon.id, m.icon.color)];
    decos = p.decos;
  }
  const empty = rarity == null && name === '无装备';
  // 与游戏一样，每一栏的高度固定（按这类装备最多的镶嵌槽数），槽少的装备下方留空，便于区分上下两件
  const lines = target.kind === 'charm' ? 1 : target.kind === 'mantle' ? 2 : 3;
  return (
    <div
      className="gb-row"
      data-selected={selected ? '' : undefined}
      data-empty={empty ? '' : undefined}
      style={{ ['--lines' as string]: lines }}
      onClick={onSelect}
    >
      <button
        type="button"
        className="gb-row__piece"
        onClick={onPickPiece}
        aria-label={`${label}：${name}，点击更换`}
      >
        <span className="gb-row__icon">
          <GameIcon src={icon} size={36} />
        </span>
        <span className="gb-row__text">
          <span className="gb-row__label">{label}</span>
          <span className="gb-row__name">{name}</span>
        </span>
        {rarity != null && (
          <span className="gb-row__rarity" style={{ ['--rar' as string]: `var(--gb-rarity-${rarity})` }}>
            R{rarity}
          </span>
        )}
      </button>
      <div className="gb-row__slots">
        {slots.map((size, i) => {
          const d = decos[i];
          const deco = d == null ? undefined : idx.decorations.get(d);
          const extra = extraFrom != null && i >= extraFrom;
          return (
            <button
              key={i}
              type="button"
              className="gb-slot"
              data-mantle={target.kind === 'mantle' ? '' : undefined}
              data-extra={extra ? '' : undefined}
              title={extra ? `${extraTag}追加的镶嵌槽` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onPickDeco(i);
              }}
              aria-label={`${size} 级镶嵌槽${extra ? `（${extraTag}追加）` : ''}：${deco?.name ?? '空'}`}
            >
              {deco ? (
                <GameIcon src={iconUrl.deco(deco.size, deco.iconColor)} size={22} />
              ) : (
                <GameIcon src={iconUrl.socket(size)} size={22} />
              )}
              <span className="gb-slot__name">{deco?.name ?? '—'}</span>
              {extra && <small className="gb-slot__tag">{extraTag}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Detail({
  target,
  build,
  idx,
  onChange,
  custom,
}: {
  target: Target;
  build: Build;
  idx: Index;
  onChange: () => void;
  custom: (w: NonNullable<ReturnType<Index['weapons']['get']>>) => React.ReactNode;
}) {
  const head = (icon: string | null, name: string, rarity: number | null, kind: string) => (
    <header className="gb-detail__head">
      <span className="gb-detail__icon">{icon && <GameIcon src={icon} size={48} />}</span>
      <div>
        <p className="gb-detail__kind">{kind}</p>
        <h2 className="gb-detail__name">{name}</h2>
      </div>
      {rarity != null && (
        <p className="gb-detail__rarity" style={{ ['--rar' as string]: `var(--gb-rarity-${rarity})` }}>
          稀有度 {rarity}
        </p>
      )}
      <button type="button" className="gb-btn" onClick={onChange}>
        更换
      </button>
    </header>
  );
  const kv = (k: string, v: React.ReactNode, status?: number) => (
    <div className="gb-kv" key={k}>
      <dt>
        {status != null && <GameIcon src={iconUrl.status(status)} size={20} />}
        {k}
      </dt>
      <dd>{v}</dd>
    </div>
  );

  if (target.kind === 'weapon') {
    const w = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
    if (!w)
      return (
        <EmptyDetail head={head(null, '未装备武器', null, WEAPON_TYPE_NAMES[build.weaponType] ?? '武器')} />
      );
    const bloat = idx.bloat[build.weaponType];
    // 客制后的数值（与游戏的强化画面一样，附上增加量）
    const bonus = customBonus(build, idx);
    const plus = (key: 'attack' | 'affinity' | 'defense') => bonus[key];
    const elementPlus = bonus.element;
    const withPlus = (base: number, add: number, fmt: (n: number) => string) => (
      <>
        {fmt(base + add)}
        {add !== 0 && <small className="gb-plus">（+{fmt(add)}）</small>}
      </>
    );
    const attackFmt = (n: number) => (bloat ? `${Math.round(n * bloat)}` : `${n}`);
    return (
      <>
        {head(
          iconUrl.weapon(build.weaponType, w.rarity),
          w.name,
          w.rarity,
          WEAPON_TYPE_NAMES[build.weaponType] ?? '武器',
        )}
        <dl className="gb-kvs">
          {kv(
            '攻击力',
            <>
              {withPlus(w.attack, plus('attack'), attackFmt)}
              {!bloat && '（真实值）'}
            </>,
            25,
          )}
          {w.sharpness &&
            w.handicraft != null &&
            kv('锐利度', <Sharpness bar={sharpnessBar(w.sharpness, w.handicraft, 0)} />)}
          {kv(
            '会心率',
            withPlus(w.affinity, plus('affinity'), (n) => `${n}%`),
            27,
          )}
          {kv(
            '属性',
            w.element ? (
              <>
                {ELEMENT_NAMES[w.element.type] ?? w.element.type}{' '}
                {withPlus(w.element.value, elementPlus, (n) => `${n * 10}`)}
              </>
            ) : (
              '—'
            ),
            3,
          )}
          {w.hiddenElement &&
            kv('隐藏属性', `${ELEMENT_NAMES[w.hiddenElement.type] ?? ''} ${w.hiddenElement.value * 10}`)}
          {kv('龙封力', ELDERSEAL[w.elderseal] ?? '—')}
          {kv('镶嵌槽', <SlotDots slots={weaponSlots(build, idx)} extraFrom={w.slots.length} />, 55)}
          {kv(
            '防御力加成',
            w.defense + plus('defense') ? withPlus(w.defense, plus('defense'), (n) => `+${n}`) : '—',
            26,
          )}
          {w.skill != null && kv('武器技能', idx.skills.get(w.skill)?.name ?? `#${w.skill}`)}
        </dl>
        {custom(w)}
      </>
    );
  }
  if (target.kind === 'armor') {
    const id = build.armor[target.slot].id;
    const a = id == null ? undefined : idx.armor.get(id);
    if (!a) return <EmptyDetail head={head(null, '未装备', null, SLOT_NAMES[target.slot])} />;
    return (
      <>
        {head(iconUrl.equip(a.slot, a.rarity), a.name, a.rarity, `${SLOT_NAMES[a.slot]} · ${a.series}`)}
        <dl className="gb-kvs">
          {kv('防御力', `${a.defense}`, 26)}
          {RESIST.map((r, i) => kv(`${r}耐性`, signed(a.resist[i] ?? 0), [3, 4, 5, 6, 7][i]))}
          {kv('镶嵌槽', <SlotDots slots={a.slots} />, 55)}
        </dl>
        <SkillRefs refs={a.skills} idx={idx} />
        {a.setSkill && (
          <p className="gb-note">
            套装：{idx.skills.get(a.setSkill.id)?.name}（本件计 {a.setSkill.points} 件）
          </p>
        )}
      </>
    );
  }
  if (target.kind === 'charm') {
    const c = build.charm == null ? undefined : idx.charms.get(build.charm);
    if (!c) return <EmptyDetail head={head(null, '未装备', null, '护石')} />;
    return (
      <>
        {head(iconUrl.equip('charm', c.rarity), c.name, c.rarity, '护石')}
        <SkillRefs refs={c.skills} idx={idx} />
      </>
    );
  }
  const p = build.mantles[target.index];
  const m = p.id == null ? undefined : idx.mantles.get(p.id);
  if (!m) return <EmptyDetail head={head(null, '未装备', null, '衣装')} />;
  return (
    <>
      {head(iconUrl.mantle(m.icon.id, m.icon.color), m.name, null, '衣装')}
      <dl className="gb-kvs">{kv('镶嵌槽', m.slots.length ? <SlotDots slots={m.slots} /> : '—', 55)}</dl>
      <p className="gb-note">衣装上的饰品技能只在穿上衣装且衣装生效时计入（顶部「衣装生效」开关）。</p>
    </>
  );
}

function EmptyDetail({ head }: { head: React.ReactNode }) {
  return (
    <>
      {head}
      <p className="gb-note">点「更换」或左侧栏位选择装备。</p>
    </>
  );
}

function SkillRefs({ refs, idx }: { refs: { id: number; level: number }[]; idx: Index }) {
  if (!refs.length) return null;
  return (
    <ul className="gb-skillrefs">
      {refs.map((r) => {
        const s = idx.skills.get(r.id);
        return (
          <li key={r.id}>
            <GameIcon src={iconUrl.skill(s?.iconColor ?? 0)} size={24} />
            <span>{s?.name ?? `#${r.id}`}</span>
            <b>+{r.level}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** 锐利度条：实色为当前长度（含匠），其后的淡色为匠 5 时还能延长的部分 */
function Sharpness({ bar }: { bar: SharpnessBarData }) {
  const FULL = 400;
  const full = sharpnessBar(bar.ends, bar.handicraft, 5);
  return (
    <span
      className="gb-sharp"
      title={`锐利度 ${bar.length} / 匠 5 时 ${bar.max}（匠的换算为推断，见数据说明）`}
    >
      {SHARPNESS_COLORS.map((c, i) => {
        const now = bar.segments[i] ?? 0;
        const extra = (full.segments[i] ?? 0) - now;
        return (
          <Fragment key={c}>
            {now > 0 && <i style={{ width: `${(now / FULL) * 100}%`, background: `var(--sharp-${c})` }} />}
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
  );
}

function SkillList({ skills, mantleActive }: { skills: SkillTotal[]; mantleActive: boolean }) {
  if (!skills.length) return <p className="gb-note">还没有技能。</p>;
  return (
    <ul className="gb-skills">
      {skills.map((t) => (
        <li
          key={t.skill.id}
          data-set={t.skill.setBonus ? '' : undefined}
          data-inactive={t.level === 0 ? '' : undefined}
        >
          <GameIcon src={iconUrl.skill(t.skill.iconColor)} size={30} />
          <div className="gb-skills__main">
            <div className="gb-skills__top">
              <span className="gb-skills__name">{t.skill.name}</span>
              {t.skill.setBonus ? (
                <span className="gb-skills__lv">{t.counted} 件</span>
              ) : (
                <span className="gb-skills__lv">
                  等级 <b>{t.level}</b>
                  {t.cap < t.skill.maxLevel && <small> / 上限 {t.cap}</small>}
                </span>
              )}
            </div>
            {t.skill.setBonus ? (
              <span className="gb-set">
                {t.skill.levels.map((l) => (
                  <i
                    key={l.level}
                    data-on={t.activeSetLevels.includes(l.level) ? '' : undefined}
                    title={l.desc}
                  >
                    {l.level} 件
                  </i>
                ))}
              </span>
            ) : (
              <LevelBoxes level={t.level} cap={t.cap} max={t.skill.maxLevel} over={t.over} />
            )}
            {t.mantlePoints > 0 && (
              <span className="gb-skills__mantle" data-on={mantleActive ? '' : undefined}>
                衣装 +{t.mantlePoints}
                {mantleActive ? '（生效中）' : '（衣装生效时）'}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 发动条件开关：只列出当前配装里已发动、且需要条件的技能 */
function Conditions({
  skills,
  on,
  onToggle,
}: {
  skills: SkillTotal[];
  on: string[];
  onToggle: (key: string) => void;
}) {
  const list = availableConditions(skills);
  if (!list.length) return null;
  const name = (id: number) => skills.find((s) => s.skill.id === id)?.skill.name ?? '';
  return (
    <div className="gb-conds" role="group" aria-label="发动条件">
      <p className="gb-conds__title">发动条件</p>
      {list.map((c) => {
        const active = on.includes(c.key);
        // 「已受伤」依赖「攻击有效部位」
        const disabled = c.key === 'wound' && !on.includes('weakness');
        return (
          <button
            key={c.key}
            type="button"
            className="gb-cond"
            aria-pressed={active && !disabled}
            disabled={disabled}
            onClick={() => onToggle(c.key)}
          >
            <span className="gb-cond__skill">{name(c.skill)}</span>
            <span className="gb-cond__label">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusList({ stats }: { stats: NonNullable<ReturnType<typeof computeStats>> }) {
  const rows: [string, React.ReactNode, number?][] = [
    ['攻击力', stats.attackDisplay ?? `${Math.round(stats.attack)}（真实值）`, 25],
    ['会心率', `${stats.affinity}%`, 27],
    ['会心伤害', `×${stats.critMultiplier}`],
    ...(stats.sharpness
      ? ([['锐利度', <Sharpness bar={stats.sharpness} />]] as [string, React.ReactNode][])
      : []),
    [
      '期望攻击力',
      <span title="攻击力 ×（1 + 会心率 ×（会心倍率 − 1））× 当前最高色锐利度倍率；未计动作值与肉质">
        {stats.effectiveDisplay ?? `${Math.round(stats.effectiveAttack)}（真实值）`}
      </span>,
    ],
    ['属性', stats.element ? `${ELEMENT_NAMES[stats.element.type] ?? ''} ${stats.element.value}` : '—', 3],
    ['龙封力', ELDERSEAL[stats.elderseal] ?? '—'],
    ['防御力', stats.defense, 26],
  ];
  return (
    <>
      <dl className="gb-kvs">
        {rows.map(([k, v, icon]) => (
          <div className="gb-kv" key={k}>
            <dt>
              {icon != null && <GameIcon src={iconUrl.status(icon)} size={20} />}
              {k}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <dl className="gb-resist">
        {RESIST.map((r, i) => (
          <div key={r} data-neg={(stats.resist[i] ?? 0) < 0 ? '' : undefined}>
            <dt>{r}</dt>
            <dd>{signed(stats.resist[i] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      {stats.attackDisplay == null && <p className="gb-note">缺少该武器种的显示倍率，攻击力显示真实值。</p>}
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function BuilderSkeleton() {
  return (
    <div className="gb gb--loading" aria-busy="true">
      <div className="gb-main">
        <div className="gb-panel gb-skeleton" />
        <div className="gb-panel gb-skeleton" />
        <div className="gb-panel gb-skeleton" />
      </div>
    </div>
  );
}

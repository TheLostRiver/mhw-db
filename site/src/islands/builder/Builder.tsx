/**
 * 配装器（v0）：布局贴近游戏的装备 / 饰品界面——左侧装备一览（每件装备右侧列出镶嵌槽与已镶饰品），
 * 中间是选中装备的详情，右侧是技能与状态。数据来自 /data/world/*.json，图标来自游戏 UI 贴图。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ARMOR_SLOTS,
  augmentLevels,
  awakeningConflict,
  awakeningTotal,
  availableConditions,
  chosenAwakening,
  computeSkills,
  computeStats,
  emptyBuild,
  emptyCustom,
  fitDecos,
  makeIndex,
  setAugment,
  weaponSlots,
  type ArmorSlot,
  type Build,
  type BuilderData,
  type Index,
  type Piece,
  type SkillTotal,
  type WeaponPayload,
} from '../../lib/world/builder';
import Picker from './Picker';
import WeaponCustomPanel, { AWAKENING_GROUPS, ROMAN, awakeningMeta } from './WeaponCustom';
import { GameIcon, iconUrl, LevelBoxes } from './icons';
import './builder.css';

export const WEAPON_TYPE_NAMES: Record<string, string> = {
  'great-sword': '大剑',
  'long-sword': '太刀',
  'sword-and-shield': '片手剑',
  'dual-blades': '双剑',
  hammer: '大锤',
  'hunting-horn': '狩猎笛',
  lance: '长枪',
  gunlance: '铳枪',
  'switch-axe': '斩击斧',
  'charge-blade': '盾斧',
  'insect-glaive': '操虫棍',
  'light-bowgun': '轻弩',
  'heavy-bowgun': '重弩',
  bow: '弓',
};
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
const STATUS_ELEMENTS = new Set(['poison', 'paralysis', 'sleep', 'blast']);
// 龙封力：3 = 大 已核对；1 / 2 按顺序推断
const ELDERSEAL = ['—', '小', '中', '大'];
const STORAGE_KEY = 'mhdb-builder-v0';

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

export default function Builder() {
  const [data, setData] = useState<BuilderData | null>(null);
  const [payload, setPayload] = useState<WeaponPayload>({ weapons: [], parts: [], awakening: [] });
  // 组件只在客户端渲染（client:only），可以直接从 localStorage 初始化
  const [build, setBuild] = useState<Build>(loadSaved);
  const [selected, setSelected] = useState<Target>({ kind: 'weapon' });
  const [picking, setPicking] = useState<Picking>(null);
  const [error, setError] = useState<string | null>(null);

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

  const update = useCallback((fn: (b: Build) => Build) => setBuild((b) => fn(structuredClone(b))), []);

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
    if (t.kind === 'weapon')
      return {
        title: `选择${WEAPON_TYPE_NAMES[build.weaponType] ?? '武器'}`,
        current: build.weapon.id,
        rankTabs: true,
        minRarity: 9,
        items: payload.weapons.map((w) => ({
          id: w.id,
          name: w.name,
          rarity: w.rarity,
          icon: <GameIcon src={iconUrl.weapon(build.weaponType, w.rarity)} size={28} />,
          meta: (
            <>
              {w.awakened ? '冥赤龙武器 · ' : ''}攻击 {w.attack} · 会心 {w.affinity}%
              {w.element ? ` · ${ELEMENT_NAMES[w.element.type] ?? ''} ${w.element.value * 10}` : ''}
            </>
          ),
          side: <SlotDots slots={w.slots} />,
        })),
      };
    if (t.kind === 'armor')
      return {
        title: `选择${SLOT_NAMES[t.slot]}防具`,
        current: build.armor[t.slot].id,
        rankTabs: true,
        minRarity: 9,
        items: data.armor
          .filter((a) => a.slot === t.slot)
          .map((a) => ({
            id: a.id,
            name: a.name,
            rarity: a.rarity,
            search: `${a.series} ${a.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' ')}`,
            icon: <GameIcon src={iconUrl.equip(a.slot, a.rarity)} size={28} />,
            meta: <SkillLine refs={a.skills} idx={idx} />,
            side: <SlotDots slots={a.slots} />,
          })),
      };
    if (t.kind === 'charm')
      return {
        title: '选择护石',
        layout: 'grid',
        current: build.charm,
        rankTabs: true,
        minRarity: 9,
        items: data.charms.map((c) => ({
          id: c.id,
          name: c.name,
          rarity: c.rarity,
          search: c.skills.map((s) => idx.skills.get(s.id)?.name ?? '').join(' '),
          icon: <GameIcon src={iconUrl.equip('charm', c.rarity)} size={36} />,
          meta: <SkillRows refs={c.skills} idx={idx} />,
        })),
      };
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

  return (
    <div className="gb" style={rarityVars}>
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
          onClick={() => setBuild(emptyBuild(build.weaponType))}
        >
          清空
        </button>
      </div>

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
            custom={(w) => (
              <WeaponCustomPanel
                weapon={w}
                build={build}
                idx={idx}
                onAugment={(category, level) =>
                  update((b) => {
                    b.custom = setAugment(b.custom, idx, category, level);
                    b.weapon.decos = fitDecos(weaponSlots(b, idx), b.weapon.decos, idx);
                    return b;
                  })
                }
                onCustom={(fn) => update((b) => ({ ...b, custom: fn(b.custom) }))}
                onPickAwakening={(slot) => setPicking({ target: { kind: 'weapon' }, awakening: slot })}
              />
            )}
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

      <p className="gb-foot">
        {`数据版本：Steam 构建 ${data.meta.steamBuildId ?? '—'}。`}
        状态按游戏数据计算：技能（有发动条件的需在「发动条件」里打开）、
        自定义强化与觉醒能力；零件强化、锐利度修正、动作值与道具增益尚未计入。
      </p>

      {picking && (
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

// ---------- 子组件 ----------

function SlotDots({ slots }: { slots: number[] }) {
  return (
    <span className="gb-slotdots">
      {slots.map((s, i) => (
        <GameIcon key={i} src={iconUrl.socket(s)} size={20} alt={`${s} 级槽`} />
      ))}
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
  onSelect,
  onPickPiece,
  onPickDeco,
}: RowProps) {
  let name = '无装备';
  let icon: string | null = null;
  let rarity: number | null = null;
  let decos: (number | null)[] = [];
  if (target.kind === 'weapon') {
    const w = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
    if (w) [name, icon, rarity] = [w.name, iconUrl.weapon(build.weaponType, w.rarity), w.rarity];
    decos = build.weapon.decos;
  } else if (target.kind === 'armor') {
    const p = build.armor[target.slot];
    const a = p.id == null ? undefined : idx.armor.get(p.id);
    if (a) [name, icon, rarity] = [a.name, iconUrl.equip(a.slot, a.rarity), a.rarity];
    decos = p.decos;
  } else if (target.kind === 'charm') {
    const c = build.charm == null ? undefined : idx.charms.get(build.charm);
    if (c) [name, icon, rarity] = [c.name, iconUrl.equip('charm', c.rarity), c.rarity];
  } else {
    const p = build.mantles[target.index];
    const m = p.id == null ? undefined : idx.mantles.get(p.id);
    if (m) [name, icon] = [m.name, iconUrl.mantle(m.icon.id, m.icon.color)];
    decos = p.decos;
  }
  const empty = icon == null;
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
          {icon ? (
            <GameIcon src={icon} size={36} />
          ) : (
            <span className="gb-row__placeholder" aria-hidden="true" />
          )}
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
          return (
            <button
              key={i}
              type="button"
              className="gb-slot"
              data-mantle={target.kind === 'mantle' ? '' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onPickDeco(i);
              }}
              aria-label={`${size} 级镶嵌槽：${deco?.name ?? '空'}`}
            >
              {deco ? (
                <GameIcon src={iconUrl.deco(deco.size, deco.iconColor)} size={22} />
              ) : (
                <GameIcon src={iconUrl.socket(size)} size={22} />
              )}
              <span className="gb-slot__name">{deco?.name ?? '—'}</span>
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
    // 自定义强化后的数值（与游戏的强化画面一样，附上增加量）
    const aug = augmentLevels(build, idx);
    const plus = (key: 'attack' | 'affinity' | 'defense') => {
      const a = aug.get(key);
      return (a ? (idx.effects[key][a.level - 1] ?? 0) : 0) + awakeningTotal(build, idx, key);
    };
    const elementPlus = w.element
      ? awakeningTotal(build, idx, STATUS_ELEMENTS.has(w.element.type) ? 'status' : 'element')
      : 0;
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
          {w.sharpness && kv('锐利度', <Sharpness bars={w.sharpness} />)}
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
          {kv('镶嵌槽', <SlotDots slots={weaponSlots(build, idx)} />, 55)}
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

function Sharpness({ bars }: { bars: number[] }) {
  const total = bars[bars.length - 1] || 1;
  const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'white', 'purple'];
  // 数据是各色的累计长度，转成每段宽度
  const widths = bars.map((end, i) => Math.max(0, end - Math.max(0, ...bars.slice(0, i))));
  return (
    <span className="gb-sharp" title="锐利度（数据原值；匠的换算未确认）">
      {widths.map((w, i) =>
        w ? (
          <i key={i} style={{ width: `${(w / total) * 100}%`, background: `var(--sharp-${colors[i]})` }} />
        ) : null,
      )}
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
    [
      '期望攻击力',
      <span title="攻击力 ×（1 + 会心率 ×（会心倍率 − 1））；未计锐利度与动作值">
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

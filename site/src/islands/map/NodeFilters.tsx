/**
 * 地图左栏：节点种类筛选（分类 + 搜索 + 详细列表）、环境状态、区域列表。
 */
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { MapNodeStage, MapPatch, MapStage, Rank } from '../../data/world/schema';
import { layerName } from '../../lib/world/maps';
import {
  CATEGORIES,
  RANK_LABEL,
  itemIconUrl,
  kindName,
  lotItemNames,
  mainItem,
  type Category,
  type MapItems,
} from '../../lib/world/mapNodes';

export type Tab = 'nodes' | 'states' | 'areas';

interface Props {
  stage: MapStage;
  nodes: MapNodeStage | null;
  items: MapItems;
  rank: Rank;
  tab: Tab;
  onTab: (t: Tab) => void;
  layer: number;
  visible: number[];
  selectedKinds: Set<string>;
  onSelectKinds: (s: Set<string>) => void;
  onHoverKind: (k: string | null) => void;
  envState: number;
  onEnvState: (s: number) => void;
  patches: MapPatch[];
  activePatch: string | null;
  onActivePatch: (p: string | null | ((a: string | null) => string | null)) => void;
  onFocusPatch: (p: MapPatch) => void;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'nodes', label: '节点' },
  { key: 'states', label: '环境状态' },
  { key: 'areas', label: '区域' },
];

export default function NodeFilters(props: Props) {
  const { nodes, tab, onTab } = props;
  const id = useId();
  const tabs = nodes ? TABS : TABS.filter((t) => t.key === 'areas');
  const current = tabs.some((t) => t.key === tab) ? tab : 'areas';

  // 标签页：左右方向键切换（WAI-ARIA tabs）
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === current);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length]!;
    onTab(t.key);
    document.getElementById(`${id}-tab-${t.key}`)?.focus();
  };

  return (
    <aside className="mv-panel mv__filters" aria-label="筛选">
      <div className="mv-tabs" role="tablist" aria-label="面板" onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`${id}-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={t.key === current}
            aria-controls={`${id}-panel`}
            tabIndex={t.key === current ? 0 : -1}
            className="mv-tabs__tab"
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${current}`}
        className="mv-panel__body"
      >
        {current === 'nodes' && nodes && <KindList {...props} nodes={nodes} />}
        {current === 'states' && nodes && <StateList {...props} nodes={nodes} />}
        {current === 'areas' && <AreaList {...props} />}
      </div>
    </aside>
  );
}

function KindList({
  nodes,
  items,
  rank,
  visible,
  selectedKinds,
  onSelectKinds,
  onHoverKind,
}: Props & { nodes: MapNodeStage }) {
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const searchId = useId();

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of visible) {
      const k = nodes.nodes[i]!.kind;
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [visible, nodes]);

  const rows = useMemo(
    () =>
      nodes.kinds.map((k) => {
        const lot = k.lots.length ? lotItemNames(k, nodes, rank, items) : [];
        const main = mainItem(k, nodes, rank);
        return {
          kind: k,
          name: kindName(k, nodes, rank, items),
          sub: lot.join('・'),
          icon: main !== null ? items[main] : undefined,
          count: counts.get(k.key) ?? 0,
          // 搜索：名称、抽选表里的物品
          text: [kindName(k, nodes, rank, items), ...lot].join(' ').toLowerCase(),
        };
      }),
    [nodes, rank, items, counts],
  );
  const present = CATEGORIES.filter((c) => rows.some((r) => r.kind.category === c.key));
  const q = query.trim().toLowerCase();
  const list = rows
    .filter((r) => (category === 'all' || r.kind.category === category) && (!q || r.text.includes(q)))
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || b.count - a.count);
  // 当前等级搜不到时，看看其他等级的抽选表里有没有
  const elsewhere =
    q && list.length === 0
      ? nodes.ranks.filter(
          (r) =>
            r !== rank &&
            nodes.kinds.some((k) =>
              lotItemNames(k, nodes, r, items).some((n) => n.toLowerCase().includes(q)),
            ),
        )
      : [];
  const picked = rows.filter((r) => selectedKinds.has(r.kind.key)).length;

  const setAll = (on: boolean) => {
    const next = new Set(selectedKinds);
    for (const r of list) {
      if (on) next.add(r.kind.key);
      else next.delete(r.kind.key);
    }
    onSelectKinds(next);
  };
  const toggle = (key: string) => {
    const next = new Set(selectedKinds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectKinds(next);
  };

  return (
    <>
      <h3 className="mv-h">节点类型</h3>
      <div className="mv-chips" role="radiogroup" aria-label="节点类型">
        {[{ key: 'all' as const, label: '全部' }, ...present].map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={category === c.key}
            className="mv-chip"
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label className="mv-search" htmlFor={searchId}>
        <span className="visually-hidden">搜索采集物</span>
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder="搜索采集物，如 燕雀石"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="mv-meta">
        列表 {list.length} 种 · 已选 {picked} 种
      </p>
      <div className="mv-h mv-h--row">
        <h3>详细列表</h3>
        <span className="mv-h__actions">
          <button type="button" className="mv-btn" onClick={() => setAll(true)}>
            全选
          </button>
          <button type="button" className="mv-btn mv-btn--ghost" onClick={() => setAll(false)}>
            清空
          </button>
        </span>
      </div>
      <ul className="mv-kinds">
        {list.map((r) => (
          <li key={r.kind.key}>
            <button
              type="button"
              className="mv-kind"
              aria-pressed={selectedKinds.has(r.kind.key)}
              data-empty={r.count === 0 || undefined}
              title={r.count === 0 ? '当前环境状态下没有这种节点' : undefined}
              onClick={() => toggle(r.kind.key)}
              onMouseEnter={() => onHoverKind(r.kind.key)}
              onMouseLeave={() => onHoverKind(null)}
              onFocus={() => onHoverKind(r.kind.key)}
              onBlur={() => onHoverKind(null)}
            >
              <span className="mv-kind__check" aria-hidden="true" />
              {r.icon ? (
                <img className="mv-kind__icon" src={itemIconUrl(r.icon)} alt="" width={64} height={64} />
              ) : (
                <span className="mv-kind__icon" />
              )}
              <span className="mv-kind__text">
                <span className="mv-kind__name">{r.name}</span>
                {r.sub && <span className="mv-kind__sub">{r.sub}</span>}
              </span>
              <span className="mv-kind__count">×{r.count}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="mv-empty">
            没有匹配的节点
            {elsewhere.length > 0 && (
              <>
                <br />
                {elsewhere.map((r) => RANK_LABEL[r]).join('、')}的抽选表里有，切换等级查看
              </>
            )}
          </li>
        )}
      </ul>
    </>
  );
}

function StateList({ nodes, items, rank, envState, onEnvState }: Props & { nodes: MapNodeStage }) {
  const extra = useMemo(() => {
    const out = new Map<number, Map<string, number>>();
    for (const n of nodes.nodes) {
      if (n.state === null || n.layer === null) continue;
      const m = out.get(n.state) ?? new Map<string, number>();
      m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
      out.set(n.state, m);
    }
    return out;
  }, [nodes]);
  const kinds = new Map(nodes.kinds.map((k) => [k.key, k]));

  return (
    <>
      <h3 className="mv-h">环境状态</h3>
      <p className="mv-meta">
        任务板上显示的地区状态，同一时间只有一种。选中后地图上加入该状态追加的节点（绿色光圈）。
      </p>
      <div className="mv-states" role="radiogroup" aria-label="环境状态">
        {nodes.states.map((s) => {
          const add = extra.get(s.id);
          const total = add ? [...add.values()].reduce((a, b) => a + b, 0) : 0;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === envState}
              className="mv-state"
              onClick={() => onEnvState(s.id)}
            >
              <span className="mv-state__radio" aria-hidden="true" />
              <span className="mv-state__name">{s.name['zh-Hans']}</span>
              {add && (
                <span className="mv-state__adds">
                  {[...add.keys()].map((key) => {
                    const id = mainItem(kinds.get(key)!, nodes, rank);
                    const it = id !== null ? items[id] : undefined;
                    return it ? <img key={key} src={itemIconUrl(it)} alt="" width={64} height={64} /> : null;
                  })}
                  <span>+{total}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function AreaList({ stage, layer, patches, activePatch, onActivePatch, onFocusPatch }: Props) {
  const groups = Array.from({ length: stage.layers }, (_, l) => ({
    layer: l,
    items: patches.filter((p) => p.layer === l).sort((a, b) => a.area - b.area),
  }));
  return (
    <>
      {groups.map(({ layer: l, items }) => (
        <section key={l} className="mv__group" data-current={l === layer || undefined}>
          <h3 className="mv-h mv-h--row">
            <span>{stage.layers > 1 ? layerName(l) : '区域'}</span>
            <span className="b-label">{items.length} 区</span>
          </h3>
          <ul className="mv__areas">
            {items.map((p) => (
              <li key={p.letter}>
                <button
                  type="button"
                  className="mv__area"
                  aria-label={`${p.area} 区`}
                  data-active={p.letter === activePatch || undefined}
                  onClick={() => onFocusPatch(p)}
                  onMouseEnter={() => onActivePatch(p.letter)}
                  onMouseLeave={() => onActivePatch((a) => (a === p.letter ? null : a))}
                  onFocus={() => onActivePatch(p.letter)}
                  onBlur={() => onActivePatch((a) => (a === p.letter ? null : a))}
                >
                  {p.area}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

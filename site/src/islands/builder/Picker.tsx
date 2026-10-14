/**
 * 通用选择器：搜索、稀有度筛选（可多选）、自定义筛选标签、排序（可切换升降序）、键盘选择、回车确认、Esc 关闭；
 * 手机上为底部抽屉。两种排版：list（单列，装备）与 grid（卡片网格，饰品 / 护石）。
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

export interface PickerItem {
  id: number;
  name: string;
  /** 额外参与搜索的文本（技能名等） */
  search?: string;
  rarity?: number;
  icon?: ReactNode;
  meta?: ReactNode;
  side?: ReactNode;
  /** 不能选时的原因（显示在条目上，点击无效） */
  disabled?: string;
}

export interface PickerFilter {
  key: string;
  label: ReactNode;
  /** 标签只有图标时的无障碍名称 */
  title?: string;
  test: (id: number) => boolean;
}

export interface PickerSort {
  key: string;
  label: string;
  /** 排序用的数值；同值时保持原顺序 */
  value: (id: number) => number;
}

interface Props {
  title: string;
  items: PickerItem[];
  current: number | null;
  layout?: 'list' | 'grid';
  /** 显示稀有度筛选（按条目里出现过的稀有度生成标签） */
  rarityFilter?: boolean;
  /** 打开时默认选中的稀有度 */
  defaultRarities?: number[];
  /** 自定义筛选标签（单选，第一项通常是「全部」） */
  filters?: PickerFilter[];
  /** 排序方式（第一项为默认顺序时 value 可返回 0） */
  sorts?: PickerSort[];
  placeholder?: string;
  onPick: (id: number | null) => void;
  onClose: () => void;
}

export default function Picker({
  title,
  items,
  current,
  layout = 'list',
  rarityFilter = false,
  defaultRarities = [],
  filters,
  sorts,
  placeholder = '名称或技能',
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [rarities, setRarities] = useState<number[]>(defaultRarities);
  const [filter, setFilter] = useState(0);
  const [sort, setSort] = useState(0);
  const [desc, setDesc] = useState(true);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const titleId = useId();

  const allRarities = useMemo(
    () => [...new Set(items.flatMap((i) => (i.rarity != null ? [i.rarity] : [])))].sort((a, b) => a - b),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = filters?.[filter];
    const out = items.filter((i) => {
      if (rarities.length && i.rarity != null && !rarities.includes(i.rarity)) return false;
      if (f && !f.test(i.id)) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.search ?? '').toLowerCase().includes(q);
    });
    const s = sorts?.[sort];
    if (!s || sort === 0) return out;
    const dir = desc ? -1 : 1;
    // 稳定排序：同值保持原顺序
    return out
      .map((it, i) => ({ it, i, v: s.value(it.id) }))
      .sort((a, b) => (a.v === b.v ? a.i - b.i : (a.v - b.v) * dir))
      .map((x) => x.it);
  }, [items, query, rarities, filters, filter, sorts, sort, desc]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  /** 网格每行几列（读实际排版，跟随响应式变化） */
  const columns = () => {
    if (layout !== 'grid' || !list.current) return 1;
    return getComputedStyle(list.current).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  };

  const move = (delta: number) => setActive((a) => Math.max(0, Math.min(filtered.length - 1, a + delta)));

  const onKey = (e: React.KeyboardEvent) => {
    const inGrid = layout === 'grid';
    if (e.key === 'Escape') return onClose();
    if (e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowDown') move(columns());
    else if (e.key === 'ArrowUp') move(-columns());
    else if (inGrid && e.key === 'ArrowRight' && e.target !== input.current) move(1);
    else if (inGrid && e.key === 'ArrowLeft' && e.target !== input.current) move(-1);
    else if (e.key === 'Enter') {
      const it = filtered[active];
      if (it && !it.disabled) onPick(it.id);
      return;
    } else return;
    e.preventDefault();
  };

  const toggleRarity = (r: number) => {
    setRarities((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r].sort((a, b) => a - b)));
    setActive(0);
  };

  return (
    <div
      className="gb-picker"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="gb-picker__card"
        data-layout={layout}
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
          <span className="visually-hidden">搜索</span>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            type="search"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <span className="gb-picker__count">{filtered.length}</span>
        </label>

        {(rarityFilter || filters || sorts) && (
          <div className="gb-picker__tools">
            {rarityFilter && allRarities.length > 1 && (
              <div className="gb-picker__tabs" role="group" aria-label="稀有度">
                <button
                  type="button"
                  className="gb-chip"
                  aria-pressed={rarities.length === 0}
                  onClick={() => {
                    setRarities([]);
                    setActive(0);
                  }}
                >
                  全部
                </button>
                {allRarities.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="gb-chip gb-chip--rar"
                    aria-pressed={rarities.includes(r)}
                    aria-label={`稀有度 ${r}`}
                    style={{ ['--rar' as string]: `var(--gb-rarity-${r})` }}
                    onClick={() => toggleRarity(r)}
                  >
                    R{r}
                  </button>
                ))}
              </div>
            )}
            {filters && (
              <div className="gb-picker__tabs" role="radiogroup" aria-label="筛选">
                {filters.map((f, i) => (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={filter === i}
                    aria-label={f.title}
                    title={f.title}
                    className="gb-chip"
                    onClick={() => {
                      setFilter(i);
                      setActive(0);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            {sorts && sorts.length > 1 && (
              <div className="gb-picker__sort">
                <label>
                  <span>排序</span>
                  <select
                    aria-label="排序方式"
                    value={sort}
                    onChange={(e) => {
                      setSort(Number(e.target.value));
                      setActive(0);
                    }}
                  >
                    {sorts.map((s, i) => (
                      <option key={s.key} value={i}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="gb-chip"
                  disabled={sort === 0}
                  aria-label={desc ? '降序，点击切换为升序' : '升序，点击切换为降序'}
                  onClick={() => setDesc((d) => !d)}
                >
                  {desc ? '↓ 降序' : '↑ 升序'}
                </button>
              </div>
            )}
          </div>
        )}

        <ul
          ref={list}
          className={layout === 'grid' ? 'gb-picker__list gb-picker__list--grid' : 'gb-picker__list'}
          role="listbox"
          aria-labelledby={titleId}
        >
          {filtered.map((it, i) => (
            <li
              key={it.id}
              role="option"
              data-index={i}
              aria-selected={i === active}
              data-current={it.id === current ? '' : undefined}
              aria-disabled={it.disabled ? true : undefined}
              // 只跟随真实的鼠标移动：打开时指针（或手指）恰好停在列表上不应改变选中项
              onPointerMove={(e) => e.pointerType === 'mouse' && i !== active && setActive(i)}
              onClick={() => !it.disabled && onPick(it.id)}
            >
              <span className="gb-picker__icon">
                {it.icon}
                {layout === 'grid' && it.rarity != null && (
                  <small style={{ ['--rar' as string]: `var(--gb-rarity-${it.rarity})` }}>
                    RARE {it.rarity}
                  </small>
                )}
              </span>
              <span className="gb-picker__main">
                <span className="gb-picker__name">
                  {layout === 'list' && it.rarity != null && (
                    <small
                      className="gb-picker__rar"
                      style={{ ['--rar' as string]: `var(--gb-rarity-${it.rarity})` }}
                    >
                      R{it.rarity}
                    </small>
                  )}
                  {it.name}
                </span>
                {it.meta && <span className="gb-picker__meta">{it.meta}</span>}
                {it.disabled && <span className="gb-picker__why">{it.disabled}</span>}
              </span>
              {it.side && <span className="gb-picker__side">{it.side}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li className="gb-picker__empty">没有匹配的条目</li>}
        </ul>
      </div>
    </div>
  );
}

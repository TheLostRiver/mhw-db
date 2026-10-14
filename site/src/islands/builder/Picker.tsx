/**
 * 通用选择器：带搜索、筛选标签、键盘选择、回车确认、Esc 关闭；手机上为底部抽屉。
 * 两种排版：list（单列，装备）与 grid（卡片网格，饰品 / 护石）。
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
}

export interface PickerFilter {
  key: string;
  label: ReactNode;
  /** 标签只有图标时的无障碍名称 */
  title?: string;
  test: (id: number) => boolean;
}

interface Props {
  title: string;
  items: PickerItem[];
  current: number | null;
  layout?: 'list' | 'grid';
  /** 显示下位 / 上位 / 大师筛选 */
  rankTabs?: boolean;
  /** 打开时默认选中的阶位（按最低稀有度） */
  minRarity?: number;
  /** 自定义筛选标签（单选，第一项通常是「全部」） */
  filters?: PickerFilter[];
  placeholder?: string;
  onPick: (id: number | null) => void;
  onClose: () => void;
}

const RANKS = [
  { label: '全部', min: 1, max: 99 },
  { label: '下位', min: 1, max: 4 },
  { label: '上位', min: 5, max: 8 },
  { label: '大师', min: 9, max: 12 },
] as const;

export default function Picker({
  title,
  items,
  current,
  layout = 'list',
  rankTabs = false,
  minRarity,
  filters,
  placeholder = '名称或技能',
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [rank, setRank] = useState(rankTabs && minRarity && minRarity >= 9 ? 3 : 0);
  const [filter, setFilter] = useState(0);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const titleId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const r = RANKS[rank]!;
    const f = filters?.[filter];
    return items.filter((i) => {
      if (rankTabs && i.rarity != null && (i.rarity < r.min || i.rarity > r.max)) return false;
      if (f && !f.test(i.id)) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.search ?? '').toLowerCase().includes(q);
    });
  }, [items, query, rank, rankTabs, filters, filter]);

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
    if (e.key === 'ArrowDown') move(columns());
    else if (e.key === 'ArrowUp') move(-columns());
    else if (inGrid && e.key === 'ArrowRight' && e.target !== input.current) move(1);
    else if (inGrid && e.key === 'ArrowLeft' && e.target !== input.current) move(-1);
    else if (e.key === 'Enter') {
      const it = filtered[active];
      if (it) onPick(it.id);
      return;
    } else return;
    e.preventDefault();
  };

  const tabs = (
    labels: { key: string; label: ReactNode; title?: string | undefined }[],
    value: number,
    set: (i: number) => void,
    name: string,
  ) => (
    <div className="gb-picker__tabs" role="radiogroup" aria-label={name}>
      {labels.map((f, i) => (
        <button
          key={f.key}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={f.title}
          title={f.title}
          className="gb-chip"
          onClick={() => {
            set(i);
            setActive(0);
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

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
        {rankTabs &&
          tabs(
            RANKS.map((r) => ({ key: r.label, label: r.label })),
            rank,
            setRank,
            '阶位',
          )}
        {filters && tabs(filters, filter, setFilter, '筛选')}
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
              // 只跟随真实的鼠标移动：打开时指针（或手指）恰好停在列表上不应改变选中项
              onPointerMove={(e) => e.pointerType === 'mouse' && i !== active && setActive(i)}
              onClick={() => onPick(it.id)}
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
                <span className="gb-picker__name">{it.name}</span>
                {it.meta && <span className="gb-picker__meta">{it.meta}</span>}
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

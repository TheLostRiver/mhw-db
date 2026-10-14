/**
 * 通用选择器：带搜索、键盘上下选择、回车确认、Esc 关闭；手机上为底部抽屉。
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

interface Props {
  title: string;
  items: PickerItem[];
  current: number | null;
  /** 可选的稀有度筛选（默认选中的最低稀有度） */
  minRarity?: number;
  onPick: (id: number | null) => void;
  onClose: () => void;
}

const RARITY_FILTERS = [
  { label: '全部', min: 1 },
  { label: '下位', min: 1, max: 4 },
  { label: '上位', min: 5, max: 8 },
  { label: '大师', min: 9, max: 12 },
] as const;

export default function Picker({ title, items, current, minRarity, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [rank, setRank] = useState(minRarity && minRarity >= 9 ? 3 : 0);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const hasRarity = items.some((i) => i.rarity != null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = RARITY_FILTERS[rank]!;
    return items.filter((i) => {
      if (hasRarity && i.rarity != null && (i.rarity < f.min || ('max' in f && i.rarity > f.max)))
        return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.search ?? '').toLowerCase().includes(q);
    });
  }, [items, query, rank, hasRarity]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      const it = filtered[active];
      if (it) onPick(it.id);
    }
  };

  return (
    <div
      className="gb-picker"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="gb-picker__card"
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
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="名称或技能"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <span className="gb-picker__count">{filtered.length}</span>
        </label>
        {hasRarity && (
          <div className="gb-picker__tabs" role="radiogroup" aria-label="阶位">
            {RARITY_FILTERS.map((f, i) => (
              <button
                key={f.label}
                type="button"
                role="radio"
                aria-checked={rank === i}
                className="gb-chip"
                onClick={() => {
                  setRank(i);
                  setActive(0);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <ul ref={list} className="gb-picker__list" role="listbox" aria-labelledby={titleId}>
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
              <span className="gb-picker__icon">{it.icon}</span>
              <span className="gb-picker__main">
                <span className="gb-picker__name">{it.name}</span>
                {it.meta && <span className="gb-picker__meta">{it.meta}</span>}
              </span>
              <span className="gb-picker__side">{it.side}</span>
            </li>
          ))}
          {filtered.length === 0 && <li className="gb-picker__empty">没有匹配的条目</li>}
        </ul>
      </div>
    </div>
  );
}

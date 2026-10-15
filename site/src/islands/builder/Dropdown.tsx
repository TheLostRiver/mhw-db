/**
 * 自绘下拉框（代替浏览器原生 <select>）：按 WAI-ARIA「只能选择的组合框」实现。
 * 触发按钮是 combobox，列表渲染到配装器根节点（position: fixed），不会被面板或弹窗裁掉。
 * 键盘：↑↓ / Home / End / PageUp / PageDown 移动，回车或空格选中，Esc 关闭，输入首字跳到对应选项。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption<T> {
  value: T;
  label: ReactNode;
  /** 纯文本：用于按首字跳转与无障碍名称（label 不是字符串时必填） */
  text?: string;
  icon?: ReactNode;
  /** 选项右侧的补充说明 */
  hint?: ReactNode;
  disabled?: boolean;
}

interface Props<T> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** 无障碍名称（没有可见标签时必填） */
  label?: string;
  /** 可见标签元素的 id */
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
}

const PAGE = 8;

export default function Dropdown<T>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  disabled = false,
  className,
}: Props<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const optId = (i: number) => `${id}-opt-${i}`;
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    width: number;
    up: boolean;
    maxHeight: number;
  } | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const current = options.findIndex((o) => Object.is(o.value, value));
  const selected = options[current];
  const textOf = (o: DropdownOption<T>) => o.text ?? (typeof o.label === 'string' ? o.label : '');

  const enabledFrom = useCallback(
    (start: number, step: 1 | -1) => {
      for (let i = start; i >= 0 && i < options.length; i += step) if (!options[i]!.disabled) return i;
      return -1;
    },
    [options],
  );

  const place = useCallback(() => {
    const b = button.current?.getBoundingClientRect();
    if (!b) return;
    const below = window.innerHeight - b.bottom;
    const up = below < 240 && b.top > below;
    // 列表不超出视口：高度按展开方向上的剩余空间截断
    const room = (up ? b.top : below) - 12;
    const left = Math.max(8, Math.min(b.left, window.innerWidth - Math.max(b.width, 160) - 8));
    setPos({
      left,
      top: up ? b.top : b.bottom,
      width: b.width,
      up,
      maxHeight: Math.max(120, Math.min(288, room)),
    });
  }, []);

  const show = (start = current) => {
    if (disabled) return;
    setHost(button.current?.closest('.gb') ?? document.body);
    setActive(Math.max(0, enabledFrom(Math.max(0, start), 1)));
    place();
    setOpen(true);
  };
  const hide = () => setOpen(false);
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    hide();
    if (!Object.is(o.value, value)) onChange(o.value);
  };

  // 打开时：点外面或窗口缩放就关闭；页面滚动时列表跟着按钮走（聚焦引起的平滑滚动也会触发滚动事件），
  // 按钮滚出视口才关闭
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (button.current?.contains(t) || list.current?.contains(t));
    const onDown = (e: PointerEvent) => !inside(e.target) && hide();
    let frame = 0;
    const onScroll = (e: Event) => {
      if (inside(e.target) || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const b = button.current?.getBoundingClientRect();
        if (!b || b.bottom < 0 || b.top > window.innerHeight) hide();
        else place();
      });
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, place]);

  // 当前项滚进列表的可见范围。只滚列表自己：scrollIntoView 会连带滚动页面，触发上面的「外部滚动即关闭」
  useLayoutEffect(() => {
    const ul = list.current;
    const li = ul?.querySelector<HTMLElement>('[data-active]');
    if (!open || !ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop - 6;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight)
      ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight + 6;
  }, [open, active]);

  /** 按首字跳转：连续输入的字符拼在一起匹配，停顿 0.6 秒后重新开始 */
  const typeahead = (ch: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 600 ? ch : t.text + ch;
    t.at = now;
    const from = open ? active : Math.max(0, current);
    const n = options.length;
    // 同一个字反复按：从下一项找起，轮流跳；连续拼写：从当前项找起
    const offset = t.text.length === 1 ? 1 : 0;
    const want = t.text.toLowerCase();
    for (let k = 0; k < n; k++) {
      const i = (from + offset + k) % n;
      const o = options[i]!;
      if (!o.disabled && textOf(o).toLowerCase().startsWith(want)) {
        if (open) setActive(i);
        else show(i);
        return;
      }
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const last = enabledFrom(options.length - 1, -1);
    const first = enabledFrom(0, 1);
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        show(e.key === 'Home' ? first : last);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
      return;
    }
    // 打开时的按键都由下拉框处理，不再交给外层（例如选择器弹窗）
    e.stopPropagation();
    const move = (to: number) => {
      e.preventDefault();
      if (to >= 0) setActive(to);
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(enabledFrom(active + 1, 1));
      case 'ArrowUp':
        return move(enabledFrom(active - 1, -1));
      case 'Home':
        return move(first);
      case 'End':
        return move(last);
      case 'PageDown':
        return move(enabledFrom(Math.min(options.length - 1, active + PAGE), -1));
      case 'PageUp':
        return move(enabledFrom(Math.max(0, active - PAGE), 1));
      case 'Enter':
      case ' ':
        e.preventDefault();
        return choose(active);
      case 'Escape':
        e.preventDefault();
        return hide();
      case 'Tab':
        return choose(active);
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        className={className ? `gb-dd ${className}` : 'gb-dd'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-label={label}
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKey}
      >
        {selected?.icon && <span className="gb-dd__icon">{selected.icon}</span>}
        <span className="gb-dd__value">{selected?.label ?? '—'}</span>
        <svg className="gb-dd__chevron" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open &&
        pos &&
        host &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className="gb-dd__list"
            data-up={pos.up ? '' : undefined}
            aria-label={label}
            aria-labelledby={labelledBy}
            style={{
              left: pos.left,
              top: pos.up ? undefined : pos.top + 4,
              bottom: pos.up ? window.innerHeight - pos.top + 4 : undefined,
              minWidth: pos.width,
              maxHeight: pos.maxHeight,
            }}
            // 列表里按下鼠标不要让按钮失去焦点
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <li
                key={i}
                id={optId(i)}
                role="option"
                aria-selected={i === current}
                aria-disabled={o.disabled ? true : undefined}
                data-active={i === active ? '' : undefined}
                onPointerMove={() => !o.disabled && i !== active && setActive(i)}
                onClick={() => choose(i)}
              >
                {o.icon && <span className="gb-dd__icon">{o.icon}</span>}
                <span className="gb-dd__label">{o.label}</span>
                {o.hint && <span className="gb-dd__hint">{o.hint}</span>}
              </li>
            ))}
          </ul>,
          host,
        )}
    </>
  );
}

/**
 * 地图右栏「节点检视」：选中节点的采集物与概率；没选中时列出已选种类的楼层分布与再生时间。
 */
import { useMemo } from 'react';
import type { MapNodeStage, Rank } from '../../data/world/schema';
import {
  RANK_LABEL,
  formatChance,
  itemIconUrl,
  kindIconUrl,
  kindName,
  layerCounts,
  lotRows,
  type MapItems,
} from '../../lib/world/mapNodes';

const fileName = (path: string) => path.split('/').at(-1) ?? path;
const RESPAWN_NOTE = 'pop_base.ppm 里的秒数，含义按数值推断，尚未与游戏内计时核对';
const HINT_NOTE =
  '地点取自物件属性 mTeasureHintNo（第几张 × 100 + 第几处），线索按处的编号对应 treasure_stXXX 的 _H0、_H1……，未在游戏内核对；何时拿到这张寻宝图未解析';
const MIN_RANK_NOTE = '这些点在 stXXX_high.sobjl 里单独加载，按文件名推断为上位起出现，尚未在游戏内核对';

interface DetailProps {
  stage: MapNodeStage;
  layers: number;
  index: number;
  rank: Rank;
  items: MapItems;
  /** 同一种类、当前环境状态下的全部点（含其他楼层） */
  siblings: number[];
  onFocus: (i: number) => void;
  onClose: () => void;
}

export function NodeDetail({ stage, layers, index, rank, items, siblings, onFocus, onClose }: DetailProps) {
  const node = stage.nodes[index]!;
  const kind = stage.kinds.find((k) => k.key === node.kind)!;
  const camp = kind.category === 'camp';
  const icon = kindIconUrl(kind, stage, rank, items);
  const state = node.state !== null ? stage.states.find((s) => s.id === node.state) : undefined;
  const at = siblings.indexOf(index);
  const step = (d: number) => onFocus(siblings[(at + d + siblings.length) % siblings.length]!);

  // 两张抽选表合成一张：物品 × 各表概率
  const tables = kind.lots.map((i) => lotRows(stage, rank, i));
  const lotItems: { item: number; count: number }[] = [];
  for (const t of tables) {
    for (const r of t) {
      if (!lotItems.some((e) => e.item === r.item && e.count === r.count)) lotItems.push(r);
    }
  }

  return (
    <article className="mv-detail" aria-label="所选节点">
      <header className="mv-detail__head">
        {icon && <img className="mv-detail__icon" src={icon} alt="" width={64} height={64} />}
        <div>
          <h3 className="mv-detail__name">
            {(camp && node.label?.['zh-Hans']) || kindName(kind, stage, rank, items)}
          </h3>
          <p className="mv-detail__where">
            {node.area !== null && `${node.area} 区`}
            {layers > 1 && node.layer !== null && ` · ${node.layer + 1}层`}
          </p>
        </div>
        <button type="button" className="mv-detail__close" aria-label="关闭" onClick={onClose} />
      </header>
      {kind.desc && <p className="mv-detail__desc">{kind.desc['zh-Hans']}</p>}
      {kind.category === 'npc' && (
        <p className="mv-detail__desc">
          出现时机由任务与剧情进度决定，有几处位置的会出现在其中一处
          <span className="mv-unconfirmed" title="位置取自 stXXX_nNNN.sobj，何时出现在哪一处尚未核对">
            未确认
          </span>
        </p>
      )}
      {kind.hints && node.step !== undefined && (
        <section className="mv-detail__hint" aria-label="寻宝线索">
          <p className="mv-meta">
            第 {node.step + 1} 处 / 共 {kind.hints.length} 处
            <span className="mv-unconfirmed" title={HINT_NOTE}>
              推断
            </span>
          </p>
          {kind.hints[node.step] && (
            <blockquote className="mv-detail__desc">{kind.hints[node.step]!['zh-Hans']}</blockquote>
          )}
        </section>
      )}
      {state && <p className="mv-detail__state">仅在「{state.name['zh-Hans']}」时出现</p>}
      {node.minRank && (
        <p className="mv-detail__state mv-detail__state--rank">
          {RANK_LABEL[node.minRank]}起出现
          <span className="mv-unconfirmed" title={MIN_RANK_NOTE}>
            推断
          </span>
        </p>
      )}
      {(kind.gathers !== null || kind.respawn !== null) && (
        <dl className="mv-detail__facts">
          {kind.gathers !== null && (
            <div>
              <dt>采集次数</dt>
              <dd>{kind.gathers} 次</dd>
            </div>
          )}
          {kind.respawn !== null && (
            <div>
              <dt>再生时间</dt>
              <dd>
                {kind.respawn > 0 ? `${kind.respawn} 秒` : '—'}
                <span className="mv-unconfirmed" title={RESPAWN_NOTE}>
                  未确认
                </span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {kind.item !== null && items[kind.item] && (
        <ul className="mv-loot">
          <li className="mv-loot__row">
            <img src={itemIconUrl(items[kind.item]!)} alt="" width={64} height={64} />
            <span className="mv-loot__name">{items[kind.item]!.name}</span>
          </li>
        </ul>
      )}
      {kind.lots.length > 0 &&
        (tables.every((t) => t.length === 0) ? (
          <p className="mv-meta">{RANK_LABEL[rank]}没有这张抽选表。</p>
        ) : (
          <table className="mv-loot mv-loot--table">
            <caption className="mv-meta">
              {RANK_LABEL[rank]}抽选表
              {tables.length > 1 && (
                <span
                  className="mv-unconfirmed"
                  title="gimmick.gcd 给每种物件两张抽选表，第二张何时使用尚未确认"
                >
                  两张表的使用条件未确认
                </span>
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col">物品</th>
                {tables.map((_, t) => (
                  <th key={t} scope="col">
                    {tables.length > 1 ? `表 ${'AB'[t]}` : '概率'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lotItems.map((e) => {
                const it = items[e.item];
                return (
                  <tr key={`${e.item}-${e.count}`} className="mv-loot__row">
                    <th scope="row">
                      {it && <img src={itemIconUrl(it)} alt="" width={64} height={64} />}
                      <span className="mv-loot__name">
                        {it?.name ?? `#${e.item}`}
                        {e.count > 1 && <span className="mv-loot__count"> ×{e.count}</span>}
                      </span>
                    </th>
                    {tables.map((t, ti) => {
                      const r = t.find((x) => x.item === e.item && x.count === e.count);
                      return <td key={ti}>{r ? `${formatChance(r.chance)}%` : '—'}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      {siblings.length > 1 && at >= 0 && (
        <div className="mv-detail__nav">
          <button type="button" className="mv-btn" onClick={() => step(-1)} aria-label="同类的上一处">
            ‹
          </button>
          <span>
            同类 {at + 1} / {siblings.length}
          </span>
          <button type="button" className="mv-btn" onClick={() => step(1)} aria-label="同类的下一处">
            ›
          </button>
        </div>
      )}
      <p className="mv-detail__src">
        来源：{fileName(node._src.file)} · {kind.key}
        {kind.lots.length > 0 && stage._src.lots[rank] && ` · ${fileName(stage._src.lots[rank]!)}`}
      </p>
    </article>
  );
}

interface Props {
  stage: MapNodeStage;
  layers: number;
  layer: number;
  rank: Rank;
  items: MapItems;
  shown: number[];
  detail: React.ReactNode;
  onFocus: (i: number) => void;
  onHoverKind: (k: string | null) => void;
}

export default function NodeInspector({
  stage,
  layers,
  layer,
  rank,
  items,
  shown,
  detail,
  onFocus,
  onHoverKind,
}: Props) {
  const groups = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const i of shown) {
      const k = stage.nodes[i]!.kind;
      by.set(k, [...(by.get(k) ?? []), i]);
    }
    return stage.kinds
      .filter((k) => by.has(k.key))
      .map((k) => ({
        kind: k,
        list: by.get(k.key)!,
        counts: layerCounts(
          by.get(k.key)!.map((i) => stage.nodes[i]!),
          layers,
        ),
      }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [shown, stage, layers]);

  return (
    <aside className="mv-panel mv__inspector" aria-label="节点检视">
      <h2 className="mv-title">节点检视</h2>
      <div className="mv-panel__body">
        <div aria-live="polite">
          {detail ?? <p className="mv-meta">点地图上的标记，查看采集物与概率。</p>}
        </div>
        <h3 className="mv-h">已选种类</h3>
        <ul className="mv-cards">
          {groups.map(({ kind, list, counts }) => {
            const icon = kindIconUrl(kind, stage, rank, items);
            const here = list.find((i) => stage.nodes[i]!.layer === layer) ?? list[0]!;
            return (
              <li key={kind.key}>
                <button
                  type="button"
                  className="mv-card"
                  onClick={() => onFocus(here)}
                  onMouseEnter={() => onHoverKind(kind.key)}
                  onMouseLeave={() => onHoverKind(null)}
                  onFocus={() => onHoverKind(kind.key)}
                  onBlur={() => onHoverKind(null)}
                >
                  <span className="mv-card__head">
                    {icon && <img src={icon} alt="" width={64} height={64} />}
                    <span className="mv-card__name">{kindName(kind, stage, rank, items)}</span>
                  </span>
                  <span className="mv-card__row">
                    <span>{layers > 1 ? '楼层分布' : '数量'}</span>
                    <span className="mv-card__floors">
                      {counts.map((c, l) => (
                        <span key={l} data-current={l === layer || undefined}>
                          {l > 0 && '/'}
                          {c}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="mv-card__row">
                    <span>再生时间</span>
                    <span>{kind.respawn ? `${kind.respawn}秒` : '—'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

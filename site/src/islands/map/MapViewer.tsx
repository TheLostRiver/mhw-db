/**
 * 大地图查看器：把各区域的羊皮纸纸片按管线配准的位置摆在 Leaflet 平面坐标里（CRS.Simple），
 * 楼层切换时高层纸片淡入、低层压暗，和游戏地图的层切换一致。
 * 采集点等标记用游戏的物品图标画在地图上，左栏筛选种类 / 环境状态，右栏查看所选节点的采集物与概率。
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapNodeStage, MapPatch, MapStage, Rank } from '../../data/world/schema';
import { labelPoint, patchUrl } from '../../lib/world/maps';
import {
  RANK_LABEL,
  kindIconUrl,
  kindName,
  nodeInRank,
  nodeVisibleIn,
  type MapItems,
} from '../../lib/world/mapNodes';
import NodeFilters, { type Tab } from './NodeFilters';
import NodeInspector, { NodeDetail } from './NodeInspector';
import './map.css';

interface Props {
  stage: MapStage;
  nodes: MapNodeStage | null;
  items: MapItems;
}

/** 低于这个缩放级别用半尺寸纸片（屏幕上每个纸片像素小于约 0.7 个 CSS 像素） */
const HALF_BELOW = -0.5;
/** 低于这个缩放级别区域号圆章与标记缩小，免得在小屏上挤在一起 */
const FAR_BELOW = -1.25;
/** 窄屏：节点详情浮在地图上，而不是放在右栏 */
const NARROW = '(max-width: 900px)';

const toLatLng = (x: number, y: number): L.LatLngTuple => [-y, x];
const patchBounds = (p: MapPatch): L.LatLngBoundsExpression => [
  toLatLng(p.mapX, p.mapY + p.rect[3]),
  toLatLng(p.mapX + p.rect[2], p.mapY),
];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setOn(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return on;
}

export default function MapViewer({ stage, nodes, items }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlays = useRef(new Map<string, L.ImageOverlay>());
  const labels = useRef(new Map<string, L.Marker>());
  const nodeLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<number, L.Marker>());
  const narrow = useMedia(NARROW);

  const [layer, setLayer] = useState(0);
  const [half, setHalf] = useState(true);
  const [far, setFar] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('nodes');
  const [rank, setRank] = useState<Rank>(nodes?.ranks.at(-1) ?? 'master');
  const [envState, setEnvState] = useState<number>(nodes?.states[0]?.id ?? 0);
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(
    // 投射器弹数量多、遍地都是，默认不画，需要时在列表里勾选
    () => new Set(nodes?.kinds.filter((k) => k.category !== 'slinger').map((k) => k.key) ?? []),
  );
  const [picked, setSelected] = useState<number | null>(null);
  const [hoverKind, setHoverKind] = useState<string | null>(null);

  const patches = useMemo(
    () => [...stage.patches].sort((a, b) => a.layer - b.layer || a.letter.localeCompare(b.letter)),
    [stage],
  );
  const layers = useMemo(() => Array.from({ length: stage.layers }, (_, i) => i), [stage]);
  const kinds = useMemo(() => new Map(nodes?.kinds.map((k) => [k.key, k]) ?? []), [nodes]);

  /** 当前等级、环境状态下出现，且落在地图上的点（下标） */
  const visible = useMemo(
    () =>
      (nodes?.nodes ?? []).flatMap((n, i) =>
        n.layer !== null && nodeVisibleIn(n, envState) && nodeInRank(n, kinds.get(n.kind)!, nodes!, rank)
          ? [i]
          : [],
      ),
    [nodes, kinds, envState, rank],
  );
  const shown = useMemo(
    () => visible.filter((i) => selectedKinds.has(nodes!.nodes[i]!.kind)),
    [visible, selectedKinds, nodes],
  );
  // 选中的点被筛掉（换环境状态、取消种类）后视为没有选中
  const selected = picked !== null && shown.includes(picked) ? picked : null;

  // 建图：只在换地图时重建
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const [x0, y0, x1, y1] = stage.bounds;
    const bounds = L.latLngBounds(toLatLng(x0, y1), toLatLng(x1, y0));
    const map = L.map(node, {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 1.5,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      attributionControl: false,
      zoomControl: false,
      maxBounds: bounds.pad(0.35),
      maxBoundsViscosity: 0.8,
    });
    L.control.zoom({ position: 'bottomright', zoomInTitle: '放大', zoomOutTitle: '缩小' }).addTo(map);
    map.fitBounds(bounds, { padding: [16, 16] });
    map.setMinZoom(map.getZoom() - 0.75);
    mapRef.current = map;

    for (const p of patches) {
      const overlay = L.imageOverlay(patchUrl(stage.id, p.letter, true), patchBounds(p), {
        className: 'mv-patch',
        interactive: true,
        alt: `${p.area} 区`,
      }).addTo(map);
      overlay.on('mouseover', () => setActive(p.letter));
      overlay.on('mouseout', () => setActive((a) => (a === p.letter ? null : a)));
      overlays.current.set(p.letter, overlay);

      const marker = L.marker(toLatLng(...labelPoint(p)), {
        icon: L.divIcon({
          className: 'mv-area',
          html: `<span>${p.area}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        title: `${p.area} 区`,
        keyboard: false,
        zIndexOffset: -1000,
      }).addTo(map);
      marker.on('mouseover', () => setActive(p.letter));
      marker.on('mouseout', () => setActive((a) => (a === p.letter ? null : a)));
      labels.current.set(p.letter, marker);
    }
    nodeLayer.current = L.layerGroup().addTo(map);

    const onZoom = () => {
      setHalf(map.getZoom() < HALF_BELOW);
      setFar(map.getZoom() < FAR_BELOW);
    };
    map.on('zoomend', onZoom);
    map.on('click', () => setSelected(null));
    onZoom();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(node);
    const overlayMap = overlays.current;
    const labelMap = labels.current;
    const markerMap = markers.current;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      nodeLayer.current = null;
      overlayMap.clear();
      labelMap.clear();
      markerMap.clear();
    };
  }, [stage, patches]);

  // 楼层：高于当前层的纸片隐藏，低于当前层的压暗
  useEffect(() => {
    for (const p of patches) {
      const img = overlays.current.get(p.letter)?.getElement();
      if (img) img.dataset.state = p.layer > layer ? 'above' : p.layer < layer ? 'below' : 'current';
      const mark = labels.current.get(p.letter)?.getElement();
      if (mark) mark.dataset.state = p.layer === layer ? 'current' : 'hidden';
    }
  }, [layer, patches]);

  // 缩放：切换纸片分辨率
  useEffect(() => {
    for (const p of patches) overlays.current.get(p.letter)?.setUrl(patchUrl(stage.id, p.letter, half));
  }, [half, patches, stage.id]);

  // 悬停 / 选中的区域高亮
  useEffect(() => {
    for (const p of patches) {
      const on = p.letter === active;
      const img = overlays.current.get(p.letter)?.getElement();
      if (img) img.toggleAttribute('data-active', on);
      const mark = labels.current.get(p.letter)?.getElement();
      if (mark) mark.toggleAttribute('data-active', on);
    }
  }, [active, patches]);

  // 标记：只画当前楼层的点；图标随等级变（矿脉等取该等级抽选表里权重最高的物品）
  useEffect(() => {
    const group = nodeLayer.current;
    if (!group || !nodes) return;
    group.clearLayers();
    markers.current.clear();
    for (const i of shown) {
      const n = nodes.nodes[i]!;
      if (n.layer !== layer) continue;
      const kind = kinds.get(n.kind)!;
      const camp = kind.category === 'camp';
      const name = (camp && n.label?.['zh-Hans']) || kindName(kind, nodes, rank, items);
      const src = kindIconUrl(kind, nodes, rank, items);
      const img = src ? `<img src="${src}" alt="" width="64" height="64" draggable="false">` : '';
      const size = camp ? 38 : 28;
      const marker = L.marker(toLatLng(n.x, n.y), {
        icon: L.divIcon({
          className: 'mv-node',
          html: `<span class="mv-node__icon" data-cat="${kind.category}"${n.state !== null ? ' data-extra' : ''}>${img}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: false,
        riseOnHover: true,
        // 营地压在采集点上面
        zIndexOffset: camp ? 500 : 0,
      });
      marker.bindTooltip(name, { direction: 'top', offset: [0, -12], className: 'mv-tip' });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelected(i);
      });
      marker.addTo(group);
      markers.current.set(i, marker);
    }
  }, [shown, layer, rank, nodes, kinds, items]);

  // 选中的点、悬停的种类：改标记的属性，不重建
  useEffect(() => {
    for (const [i, m] of markers.current) {
      const node = m.getElement();
      if (!node) continue;
      node.toggleAttribute('data-selected', i === selected);
      node.toggleAttribute('data-dim', hoverKind !== null && nodes!.nodes[i]!.kind !== hoverKind);
      const camp = kinds.get(nodes!.nodes[i]!.kind)?.category === 'camp';
      m.setZIndexOffset(i === selected ? 1000 : camp ? 500 : 0);
    }
  }, [selected, hoverKind, shown, layer, rank, nodes, kinds]);

  const flyTo = useCallback((x: number, y: number) => {
    const map = mapRef.current;
    if (!map) return;
    const target = toLatLng(x, y);
    const zoom = Math.max(map.getZoom(), -0.5);
    if (reducedMotion()) map.setView(target, zoom);
    else map.flyTo(target, zoom, { duration: 0.6 });
  }, []);

  const focusPatch = useCallback(
    (p: MapPatch) => {
      setLayer(p.layer);
      setActive(p.letter);
      flyTo(...labelPoint(p));
    },
    [flyTo],
  );

  const focusNode = useCallback(
    (i: number) => {
      const n = nodes?.nodes[i];
      if (!n || n.layer === null) return;
      setLayer(n.layer);
      setSelectedKinds((s) => (s.has(n.kind) ? s : new Set(s).add(n.kind)));
      setSelected(i);
      flyTo(n.x, n.y);
    },
    [nodes, flyTo],
  );

  const stateName = nodes?.states.find((s) => s.id === envState)?.name['zh-Hans'];
  const detail =
    nodes && selected !== null ? (
      <NodeDetail
        stage={nodes}
        layers={stage.layers}
        index={selected}
        rank={rank}
        items={items}
        siblings={visible.filter((i) => nodes.nodes[i]!.kind === nodes.nodes[selected]!.kind)}
        onFocus={focusNode}
        onClose={() => setSelected(null)}
      />
    ) : null;

  return (
    <div className="mv" data-far={far || undefined}>
      <div className="mv__center">
        {nodes && (
          <div className="mv__toolbar">
            <div className="mv__ranks" role="radiogroup" aria-label="等级">
              {nodes.ranks.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={r === rank}
                  className="mv-tab"
                  onClick={() => setRank(r)}
                >
                  {RANK_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="mv__hint">
              {shown.length} / {visible.length} 处 · 抽选表按{RANK_LABEL[rank]}显示
            </p>
          </div>
        )}
        <div className="mv__stage">
          <div ref={el} className="mv__map" aria-label={`${stage.name['zh-Hans']}地图`} />
          {stage.layers > 1 && (
            <div className="mv__layers">
              <button
                type="button"
                className="mv__chev"
                aria-label="上一层"
                disabled={layer === stage.layers - 1}
                onClick={() => setLayer((l) => Math.min(stage.layers - 1, l + 1))}
              />
              {/* 和游戏一样高层在上：菱形叠放，当前层橙色、外圈描边 */}
              <div className="mv__layer-list" role="radiogroup" aria-label="楼层">
                {[...layers].reverse().map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={l === layer}
                    className="mv__layer"
                    onClick={() => setLayer(l)}
                  >
                    <span className="mv__dia" aria-hidden="true" />
                    <span className="mv__lnum">{l + 1}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mv__chev mv__chev--down"
                aria-label="下一层"
                disabled={layer === 0}
                onClick={() => setLayer((l) => Math.max(0, l - 1))}
              />
            </div>
          )}
          {nodes && stateName && (
            <button
              type="button"
              className="mv__env"
              data-on={envState !== nodes.states[0]?.id || undefined}
              onClick={() => setTab('states')}
              title="切换环境状态"
            >
              <span className="mv__env-dot" aria-hidden="true" />
              {stateName}
            </button>
          )}
          {narrow && detail && <div className="mv__float">{detail}</div>}
        </div>
      </div>

      <NodeFilters
        stage={stage}
        nodes={nodes}
        items={items}
        rank={rank}
        tab={tab}
        onTab={setTab}
        layer={layer}
        visible={visible}
        selectedKinds={selectedKinds}
        onSelectKinds={setSelectedKinds}
        onHoverKind={setHoverKind}
        envState={envState}
        onEnvState={setEnvState}
        patches={patches}
        activePatch={active}
        onActivePatch={setActive}
        onFocusPatch={focusPatch}
      />

      {nodes && (
        <NodeInspector
          stage={nodes}
          layers={stage.layers}
          layer={layer}
          rank={rank}
          items={items}
          shown={shown}
          detail={narrow ? null : detail}
          onFocus={focusNode}
          onHoverKind={setHoverKind}
        />
      )}
    </div>
  );
}

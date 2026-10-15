/**
 * 大地图查看器：把各区域的羊皮纸纸片按管线配准的位置摆在 Leaflet 平面坐标里（CRS.Simple），
 * 楼层切换时高层纸片淡入、低层压暗，和游戏地图的层切换一致。
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapPatch, MapStage } from '../../data/world/schema';
import { labelPoint, layerName, patchUrl } from '../../lib/world/maps';
import './map.css';

interface Props {
  stage: MapStage;
}

/** 低于这个缩放级别用半尺寸纸片（屏幕上每个纸片像素小于约 0.7 个 CSS 像素） */
const HALF_BELOW = -0.5;
/** 低于这个缩放级别区域号圆章缩小，免得在小屏上挤在一起 */
const FAR_BELOW = -1.25;

const toLatLng = (x: number, y: number): L.LatLngTuple => [-y, x];
const patchBounds = (p: MapPatch): L.LatLngBoundsExpression => [
  toLatLng(p.mapX, p.mapY + p.rect[3]),
  toLatLng(p.mapX + p.rect[2], p.mapY),
];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function MapViewer({ stage }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlays = useRef(new Map<string, L.ImageOverlay>());
  const labels = useRef(new Map<string, L.Marker>());
  const [layer, setLayer] = useState(0);
  const [half, setHalf] = useState(true);
  const [far, setFar] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const patches = useMemo(
    () => [...stage.patches].sort((a, b) => a.layer - b.layer || a.letter.localeCompare(b.letter)),
    [stage],
  );
  const layers = useMemo(() => Array.from({ length: stage.layers }, (_, i) => i), [stage]);

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
      }).addTo(map);
      marker.on('mouseover', () => setActive(p.letter));
      marker.on('mouseout', () => setActive((a) => (a === p.letter ? null : a)));
      labels.current.set(p.letter, marker);
    }

    const onZoom = () => {
      setHalf(map.getZoom() < HALF_BELOW);
      setFar(map.getZoom() < FAR_BELOW);
    };
    map.on('zoomend', onZoom);
    onZoom();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(node);
    const overlayMap = overlays.current;
    const labelMap = labels.current;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayMap.clear();
      labelMap.clear();
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

  const focusPatch = useCallback((p: MapPatch) => {
    setLayer(p.layer);
    setActive(p.letter);
    const map = mapRef.current;
    if (!map) return;
    const target = toLatLng(...labelPoint(p));
    const zoom = Math.max(map.getZoom(), -0.5);
    if (reducedMotion()) map.setView(target, zoom);
    else map.flyTo(target, zoom, { duration: 0.6 });
  }, []);

  const areas = useMemo(
    () =>
      layers.map((l) => ({
        layer: l,
        items: patches.filter((p) => p.layer === l).sort((a, b) => a.area - b.area),
      })),
    [layers, patches],
  );

  return (
    <div className="mv" data-far={far || undefined}>
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
      </div>

      <aside className="mv__side" aria-label="区域">
        {areas.map(({ layer: l, items }) => (
          <section key={l} className="mv__group" data-current={l === layer || undefined}>
            {stage.layers > 1 && (
              <h3 className="mv__group-head">
                <span>{layerName(l)}</span>
                <span className="b-label">{items.length} 区</span>
              </h3>
            )}
            <ul className="mv__areas">
              {items.map((p) => (
                <li key={p.letter}>
                  <button
                    type="button"
                    className="mv__area"
                    aria-label={`${p.area} 区`}
                    data-active={p.letter === active || undefined}
                    onClick={() => focusPatch(p)}
                    onMouseEnter={() => setActive(p.letter)}
                    onMouseLeave={() => setActive((a) => (a === p.letter ? null : a))}
                    onFocus={() => setActive(p.letter)}
                    onBlur={() => setActive((a) => (a === p.letter ? null : a))}
                  >
                    {p.area}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
    </div>
  );
}

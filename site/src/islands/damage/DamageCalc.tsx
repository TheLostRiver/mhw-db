/**
 * 伤害计算器：武器数值（可从配装器导入）× 招式（动作值、补正）× 怪物部位（肉质）→ 一次命中的伤害。
 * 公式见 lib/world/damage.ts；数据由 /data/world/damage.json 提供，配装器导入时另取 builder.json 与武器数据。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  computeSkills,
  computeStats,
  emptyBuild,
  emptyCustom,
  makeIndex,
  SHARPNESS_COLORS,
  type Build,
  type BuilderData,
  type WeaponPayload,
} from '../../lib/world/builder';
import {
  ELEMENT_KEYS,
  hitDamage,
  trueRaw,
  type Attacker,
  type ElementKey,
  type HitResult,
} from '../../lib/world/damage';
import {
  singleRank,
  STATE_NAMES,
  targetRows,
  type DamageData,
  type DamageMove,
  type TargetRow,
} from '../../lib/world/damage-data';
import { DAMAGE_TYPE_LABEL, fmt, GROUP_LABEL } from '../../lib/world/moves';
import { ELEMENT_LABEL } from '../../lib/world/monsters';
import { WEAPON_ORDER, WEAPON_TYPE_NAMES, weaponIconUrl } from '../../lib/world/weapons';
import { RANGED, type WeaponType } from '../../data/world/schema';
import './damage.css';

const STORAGE_KEY = 'mhdb-damage-v0';
const BUILDER_KEY = 'mhdb-builder-v0';
const SHARP_LABEL = ['红', '橙', '黄', '绿', '青', '白', '紫'];
const SKILL_WEAKNESS = 50;
const SKILL_CRIT_BOOST = 49;
const SKILL_CRIT_ELEMENT = 165;

interface Inputs {
  weaponType: WeaponType;
  attack: number;
  affinity: number;
  element: ElementKey | 'none';
  elementValue: number;
  sharpness: number;
  critBoost: number;
  weakness: number;
  wounded: boolean;
  critElement: number;
  extraRaw: number;
  rawMultiplier: number;
  monster: string;
  master: boolean;
  target: string | null;
  move: string | null;
}

const DEFAULTS: Inputs = {
  weaponType: 'great-sword',
  attack: 1104,
  affinity: 0,
  element: 'none',
  elementValue: 0,
  sharpness: 5,
  critBoost: 0,
  weakness: 0,
  wounded: false,
  critElement: 1,
  extraRaw: 0,
  rawMultiplier: 100,
  monster: 'em001_00',
  master: true,
  target: null,
  move: null,
};

function loadInputs(): Inputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Inputs>) };
  } catch {
    /* 忽略损坏的存档 */
  }
  return DEFAULTS;
}

/** 招式的唯一键：武器 + 名字 + 序号（同名多段时区分） */
const moveKey = (m: DamageMove, i: number) => `${m.weapon}:${i}`;
const num = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

async function importFromBuilder(): Promise<{ inputs: Partial<Inputs>; note: string }> {
  const raw = localStorage.getItem(BUILDER_KEY);
  if (!raw) throw new Error('配装器里还没有配装（在配装器选好武器后再导入）');
  const saved = JSON.parse(raw) as Partial<Build>;
  const build: Build = {
    ...emptyBuild(),
    ...saved,
    custom: { ...emptyCustom(), ...saved.custom },
    // 弱点特效按命中部位的肉质自动计算，导入时不计配装器里的开关
    conditions: (saved.conditions ?? []).filter((c) => c !== 'weakness' && c !== 'wound'),
  };
  const get = (url: string) =>
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} ${r.status}`))));
  const [data, payload] = (await Promise.all([
    get('/data/world/builder.json'),
    get(`/data/world/weapons/${build.weaponType}.json`),
  ])) as [BuilderData, WeaponPayload];
  const idx = makeIndex(data, payload);
  const weapon = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
  if (!weapon) throw new Error('配装器里没有选武器');
  const skills = computeSkills(build, idx);
  const stats = computeStats(build, idx, skills);
  const lv = (id: number) => skills.find((s) => s.skill.id === id)?.level ?? 0;
  const el = stats.element && (ELEMENT_KEYS as string[]).includes(stats.element.type) ? stats.element : null;
  return {
    inputs: {
      weaponType: build.weaponType as WeaponType,
      attack: stats.attackDisplay ?? Math.round(stats.attack),
      affinity: Math.round(stats.affinity),
      element: el ? (el.type as ElementKey) : 'none',
      elementValue: el?.value ?? 0,
      sharpness: stats.sharpness ? Math.max(stats.sharpness.top, 0) : -1,
      critBoost: lv(SKILL_CRIT_BOOST),
      weakness: lv(SKILL_WEAKNESS),
      extraRaw: 0,
      rawMultiplier: 100,
    },
    note:
      `已导入「${weapon.name}」：攻击 ${stats.attackDisplay ?? '—'}、会心 ${Math.round(stats.affinity)}%` +
      (lv(SKILL_CRIT_ELEMENT) > 0 ? '；配装有会心攻击【属性】，请按武器种类填写会心属性倍率' : ''),
  };
}

export default function DamageCalc() {
  const [data, setData] = useState<DamageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inp, setInp] = useState<Inputs>(loadInputs);
  const [moveQuery, setMoveQuery] = useState('');
  const [monsterQuery, setMonsterQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setInp((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    fetch('/data/world/damage.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: DamageData) => setData(d))
      .catch((e: unknown) => setError(`数据加载失败：${String(e)}`));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inp));
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [inp]);

  const ranged = RANGED.has(inp.weaponType);
  const moves = useMemo(
    () =>
      data
        ? data.moves.map((m, i) => ({ m, key: moveKey(m, i) })).filter((x) => x.m.weapon === inp.weaponType)
        : [],
    [data, inp.weaponType],
  );
  const shownMoves = useMemo(() => {
    const q = moveQuery.trim().toLowerCase();
    return q ? moves.filter((x) => `${x.m.name} ${x.m.ja}`.toLowerCase().includes(q)) : moves;
  }, [moves, moveQuery]);
  const move = moves.find((x) => x.key === inp.move)?.m ?? moves[0]?.m;
  const monster = data?.monsters.find((m) => m.key === inp.monster) ?? data?.monsters[0];
  const single = monster ? singleRank(monster) : true;
  const master = single ? false : inp.master;
  const targets = useMemo(() => (monster ? targetRows(monster, master) : []), [monster, master]);
  const target = targets.find((t) => t.key === inp.target) ?? targets[0];
  const shownMonsters = useMemo(() => {
    const q = monsterQuery.trim().toLowerCase();
    return data ? data.monsters.filter((m) => !q || m.name.toLowerCase().includes(q)) : [];
  }, [data, monsterQuery]);

  const k = data?.constants;
  const attacker: Attacker | null = k
    ? {
        raw:
          (trueRaw(inp.attack, k.weaponBloat[inp.weaponType] ?? 1) + inp.extraRaw) *
          (inp.rawMultiplier / 100),
        affinity: inp.affinity,
        element: inp.element === 'none' ? null : { type: inp.element, value: inp.elementValue / 10 },
        sharpness: ranged ? -1 : inp.sharpness,
        critMultiplier: inp.critBoost > 0 ? (k.critBoost[inp.critBoost - 1] ?? 125) / 100 : k.critMultiplier,
        critElement: inp.critElement,
        weakness: inp.weakness > 0 ? (k.weakness[inp.weakness - 1] ?? [0, 0]) : [0, 0],
        wounded: inp.wounded,
      }
    : null;
  const calc = (m: DamageMove, t: TargetRow): HitResult | null =>
    attacker && k ? hitDamage(attacker, m, t.hz, k) : null;
  const result = move && target ? calc(move, target) : null;

  if (error) return <p className="dc-error">{error}</p>;
  if (!data || !k || !attacker) return <p className="dc-loading">加载数据中…</p>;

  const bestPart = move ? Math.max(...targets.map((t) => calc(move, t)?.expected ?? 0)) : 0;

  return (
    <div className="dc">
      <div className="dc-inputs">
        <section className="dc-card">
          <header className="dc-card__head">
            <h2>武器</h2>
            <button
              type="button"
              className="dc-btn"
              onClick={() => {
                setNote(null);
                importFromBuilder()
                  .then(({ inputs, note: n }) => {
                    setInp((s) => ({ ...s, ...inputs, move: null }));
                    setNote(n);
                  })
                  .catch((e: unknown) => setNote(e instanceof Error ? e.message : String(e)));
              }}
            >
              从配装器导入
            </button>
          </header>
          {note && (
            <p className="dc-note" role="status">
              {note}
            </p>
          )}
          <div className="dc-weapons" role="radiogroup" aria-label="武器种类">
            {WEAPON_ORDER.map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={inp.weaponType === w}
                title={WEAPON_TYPE_NAMES[w]}
                onClick={() => setInp((s) => ({ ...s, weaponType: w, move: null }))}
              >
                <img src={weaponIconUrl(w, 0)} alt="" width="28" height="28" />
                <span>{WEAPON_TYPE_NAMES[w]}</span>
              </button>
            ))}
          </div>
          <div className="dc-fields">
            <label>
              <span>攻击力（显示值）</span>
              <input
                type="number"
                min={0}
                value={inp.attack}
                onChange={(e) => set('attack', Number(e.target.value) || 0)}
              />
              <small>
                真实值 {num(trueRaw(inp.attack, k.weaponBloat[inp.weaponType] ?? 1))}（÷
                {k.weaponBloat[inp.weaponType]}）
              </small>
            </label>
            <label>
              <span>会心率 %</span>
              <input
                type="number"
                min={-100}
                max={100}
                value={inp.affinity}
                onChange={(e) => set('affinity', Number(e.target.value) || 0)}
              />
              <small>不含弱点特效（按部位自动加）</small>
            </label>
            <label>
              <span>属性</span>
              <select
                value={inp.element}
                onChange={(e) => set('element', e.target.value as Inputs['element'])}
              >
                <option value="none">无 / 异常属性</option>
                {ELEMENT_KEYS.map((e) => (
                  <option key={e} value={e}>
                    {ELEMENT_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>属性值（显示值）</span>
              <input
                type="number"
                min={0}
                disabled={inp.element === 'none'}
                value={inp.elementValue}
                onChange={(e) => set('elementValue', Number(e.target.value) || 0)}
              />
            </label>
          </div>
          {!ranged && (
            <div className="dc-row">
              <span className="dc-row__label">锐利度</span>
              <div className="dc-sharp" role="radiogroup" aria-label="锐利度">
                {SHARPNESS_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={inp.sharpness === i}
                    className={`dc-sharp--${c}`}
                    onClick={() => set('sharpness', i)}
                    title={`${SHARP_LABEL[i]}：物理 ×${k.sharpness.raw[i]}、属性 ×${k.sharpness.element[i]}`}
                  >
                    {SHARP_LABEL[i]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="dc-card">
          <header className="dc-card__head">
            <h2>技能与加成</h2>
          </header>
          <Levels
            label="超会心"
            max={k.critBoost.length}
            value={inp.critBoost}
            onChange={(v) => set('critBoost', v)}
          />
          <Levels
            label="弱点特效"
            max={k.weakness.length}
            value={inp.weakness}
            onChange={(v) => set('weakness', v)}
          />
          <label className="dc-check">
            <input type="checkbox" checked={inp.wounded} onChange={(e) => set('wounded', e.target.checked)} />
            部位已受伤（弱点特效用受伤加成）
          </label>
          <div className="dc-fields">
            <label>
              <span>会心属性倍率</span>
              <input
                type="number"
                min={1}
                step={0.05}
                value={inp.critElement}
                onChange={(e) => set('critElement', Number(e.target.value) || 1)}
              />
              <small>会心攻击【属性】，未装备填 1</small>
            </label>
            <label>
              <span>额外攻击（真实值）</span>
              <input
                type="number"
                value={inp.extraRaw}
                onChange={(e) => set('extraRaw', Number(e.target.value) || 0)}
              />
              <small>道具、饭等加算</small>
            </label>
            <label>
              <span>攻击倍率 %</span>
              <input
                type="number"
                min={0}
                value={inp.rawMultiplier}
                onChange={(e) => set('rawMultiplier', Number(e.target.value) || 0)}
              />
              <small>乘在真实攻击力上</small>
            </label>
          </div>
        </section>

        <section className="dc-card">
          <header className="dc-card__head">
            <h2>招式</h2>
            <span className="b-label">{moves.length} 条</span>
          </header>
          <input
            className="dc-search"
            type="search"
            placeholder="按招式名筛选"
            aria-label="按招式名筛选"
            value={moveQuery}
            onChange={(e) => setMoveQuery(e.target.value)}
          />
          <ul className="dc-list" aria-label="招式">
            {shownMoves.map(({ m, key }) => (
              <li key={key}>
                <button type="button" aria-pressed={move === m} onClick={() => set('move', key)}>
                  <span className="dc-list__name">{m.name}</span>
                  <span className="dc-list__meta">
                    {DAMAGE_TYPE_LABEL[m.type]} {m.mv ? fmt(m.mv) : `固定 ${fmt(m.fixed)}`}
                    {m.ele !== 1 && m.mv > 0 && ` · 属性 ×${fmt(m.ele)}`}
                  </span>
                </button>
              </li>
            ))}
            {shownMoves.length === 0 && <li className="dc-empty">没有匹配的招式</li>}
          </ul>
        </section>
      </div>

      <div className="dc-side">
        <section className="dc-card">
          <header className="dc-card__head">
            <h2>怪物</h2>
            {!single && (
              <div className="dc-seg" role="radiogroup" aria-label="等级">
                {(
                  [
                    [true, '大师级'],
                    [false, '上位及以下'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={inp.master === v}
                    onClick={() => set('master', v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </header>
          <input
            className="dc-search"
            type="search"
            placeholder="按名字筛选"
            aria-label="按名字筛选怪物"
            value={monsterQuery}
            onChange={(e) => setMonsterQuery(e.target.value)}
          />
          <ul className="dc-monsters" aria-label="怪物">
            {shownMonsters.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  aria-pressed={m === monster}
                  title={m.name}
                  onClick={() => setInp((s) => ({ ...s, monster: m.key, target: null }))}
                >
                  {m.icon ? <img src={m.icon} alt="" width="36" height="36" loading="lazy" /> : <span />}
                  <span>{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {monster && (
            <div className="dc-targets" role="radiogroup" aria-label="部位">
              {targets.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={t === target}
                  onClick={() => set('target', t.key)}
                >
                  <span>
                    {t.label}
                    {t.state > 0 && <em>{STATE_NAMES[t.state]}</em>}
                  </span>
                  <span className="dc-targets__hz">
                    {t.hz[0]}/{t.hz[1]}/{t.hz[2]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {move && target && result && (
          <section className="dc-card dc-result" aria-live="polite">
            <header className="dc-card__head">
              <h2>
                {move.name} → {monster?.name}·{target.label}
                {target.state > 0 ? `（${STATE_NAMES[target.state]}）` : ''}
              </h2>
            </header>
            <p className="dc-result__meta">
              {DAMAGE_TYPE_LABEL[move.type]}肉质 {result.physicalHz}
              {attacker.element && ` · ${ELEMENT_LABEL[attacker.element.type]}属性肉质 ${result.elementHz}`} ·
              会心率 {result.affinity}%{result.affinity !== inp.affinity && '（含弱点特效）'} · 会心倍率 ×
              {attacker.critMultiplier}
            </p>
            <table className="dc-table">
              <thead>
                <tr>
                  <th />
                  <th>非会心</th>
                  <th>会心</th>
                  <th>期望</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>物理</th>
                  <td>{num(result.raw)}</td>
                  <td>{num(result.rawCrit)}</td>
                  <td>{num(result.rawExpected)}</td>
                </tr>
                <tr>
                  <th>属性</th>
                  <td>{num(result.element)}</td>
                  <td>{num(result.elementCrit)}</td>
                  <td>{num(result.elementExpected)}</td>
                </tr>
                {result.fixed > 0 && (
                  <tr>
                    <th>固定</th>
                    <td>{num(result.fixed)}</td>
                    <td>{num(result.fixed)}</td>
                    <td>{num(result.fixed)}</td>
                  </tr>
                )}
                <tr className="dc-table__total">
                  <th>合计</th>
                  <td>{num(result.total)}</td>
                  <td>{num(result.totalCrit)}</td>
                  <td>{num(result.expected)}</td>
                </tr>
              </tbody>
            </table>
            {(result.stun > 0 || result.exhaust > 0) && (
              <p className="dc-result__meta">
                眩晕值 {num(result.stun)} · 减气值 {num(result.exhaust)}（按眩晕 / 减气肉质）
              </p>
            )}
          </section>
        )}
      </div>

      {move && (
        <section className="dc-card dc-wide">
          <header className="dc-card__head">
            <h2>「{move.name}」打各部位</h2>
            <span className="b-label">期望伤害</span>
          </header>
          <div className="dc-bars">
            {targets.map((t) => {
              const r = calc(move, t);
              if (!r) return null;
              return (
                <button
                  key={t.key}
                  type="button"
                  className="dc-bar"
                  aria-pressed={t === target}
                  onClick={() => set('target', t.key)}
                >
                  <span className="dc-bar__label">
                    {t.label}
                    {t.state > 0 && <em>{STATE_NAMES[t.state]}</em>}
                  </span>
                  <span className="dc-bar__track">
                    <span style={{ width: `${bestPart > 0 ? (r.expected / bestPart) * 100 : 0}%` }} />
                  </span>
                  <span className="dc-bar__value">{num(r.expected)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {target && (
        <section className="dc-card dc-wide">
          <header className="dc-card__head">
            <h2>各招式打「{target.label}」</h2>
            <span className="b-label">按筛选结果列出</span>
          </header>
          <div className="dc-table-wrap">
            <table className="dc-table dc-table--moves">
              <thead>
                <tr>
                  <th className="dc-left">招式</th>
                  <th>分组</th>
                  <th>类型</th>
                  <th>动作值</th>
                  <th>属性补正</th>
                  <th>物理</th>
                  <th>属性</th>
                  <th>期望合计</th>
                </tr>
              </thead>
              <tbody>
                {shownMoves.map(({ m, key }) => {
                  const r = calc(m, target);
                  if (!r) return null;
                  return (
                    <tr
                      key={key}
                      className={m === move ? 'is-current' : undefined}
                      onClick={() => set('move', key)}
                    >
                      <td className="dc-left">{m.name}</td>
                      <td>{GROUP_LABEL[m.group].replace(/（.*$/, '')}</td>
                      <td>{DAMAGE_TYPE_LABEL[m.type]}</td>
                      <td>{m.mv ? fmt(m.mv) : '—'}</td>
                      <td>{fmt(m.ele)}</td>
                      <td>{num(r.rawExpected)}</td>
                      <td>{num(r.elementExpected)}</td>
                      <td className="dc-strong">{num(r.expected)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Levels({
  label,
  max,
  value,
  onChange,
}: {
  label: string;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="dc-row">
      <span className="dc-row__label">{label}</span>
      <div className="dc-seg" role="radiogroup" aria-label={label}>
        {Array.from({ length: max + 1 }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)}>
            {i === 0 ? '无' : `Lv${i}`}
          </button>
        ))}
      </div>
    </div>
  );
}
